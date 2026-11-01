import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.REMOTE_APP_URL;
assert(base && (new URL(base).hostname==='mata-beauty.com'||base.endsWith('.vercel.app')));
const output=process.env.AUTH_QA_OUTPUT??'work/ux-audit/public';
await mkdir(output,{recursive:true});
const axe=await readFile('node_modules/axe-core/axe.min.js','utf8');
const browser=await chromium.launch({channel:'chromium'});
const results=[];
try {
 for(const theme of ['light','dark']){
  const context=await browser.newContext({colorScheme:theme,extraHTTPHeaders:process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{}});
  await context.addInitScript(theme=>localStorage.setItem('mata-theme',theme),theme);
  const page=await context.newPage();
  for(const [width,height] of [[375,812],[390,844],[768,1024],[1366,768],[1440,900],[1920,1080]]){
   await page.setViewportSize({width,height});
   for(const screen of ['feed','discover','login','signup','reset']){
    await page.goto(base+(screen==='discover'?'/discover':'/'));
    await page.getByRole('navigation',{name:'Navigation de l’application'}).waitFor();
    if(['login','signup','reset'].includes(screen)){
     await page.getByRole('navigation',{name:'Navigation de l’application'}).getByRole('button',{name:/^(Profil|Se connecter à MATA Beauty)$/}).click();
     if(screen==='signup')await page.getByRole('button',{name:'Créer un compte',exact:true}).click();
     if(screen==='reset')await page.getByRole('button',{name:'Mot de passe oublié',exact:true}).click();
    }
    await page.waitForTimeout(1200);
    await page.evaluate(axe);
    const scan=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,count:v.nodes.length}))};});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    await page.screenshot({path:`${output}/${screen}-${theme}-${width}.png`});
    results.push({screen,theme,width,height,overflow,...scan});
    await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
    console.log(`${screen} ${theme} ${width}: ${scan.violations.map(v=>v.id+':'+v.nodes.length).join(',')} overflow=${overflow}`);
   }
  }
  await context.close();
 }
}finally{await browser.close();await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));}
if(results.some(r=>r.overflow||r.violations.length))process.exitCode=1;
