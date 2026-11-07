import ts from 'typescript';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd(), out=join(root,'docs/qa/2026-11-07');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const files=walk(join(root,'app')).concat(walk(join(root,'lib'))).filter(f=>/\.(tsx?|mjs)$/.test(f));
const inventory={generatedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'AST app + lib; counts are inventory, not behavioral coverage',routes:[],interactions:[],forms:[],fields:[],navigation:[],apiCalls:[],candidates:[],tests:[]};
const cleanRoute=f=>'/'+relative(join(root,'app'),f).replace(/\/(page|route)\.tsx?$/,'').replace(/^(page|route)\.tsx?$/,'').split('/').filter(s=>!/^\(.*\)$/.test(s)&&!s.startsWith('@')).join('/');
for(const file of files){
 const source=readFileSync(file,'utf8'), sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS), path=relative(root,file);
 const at=n=>({file:path,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
 const text=n=>n?.getText(sf)??'';
 const short=n=>text(n).replace(/\s+/g,' ').slice(0,240);
 if(/\/(page|route)\.tsx?$/.test(file))inventory.routes.push({...at(sf),path:cleanRoute(file),kind:/\/route\.ts$/.test(file)?'endpoint':'page',dynamic:/\[/.test(cleanRoute(file))});
 function visit(n){
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const tag=text(n.tagName), attrs=Object.fromEntries(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[text(a.name),a.initializer]));
   const element=ts.isJsxOpeningElement(n)?n.parent:n;
   const base={...at(n),tag,label:short(element),name:short(attrs.name),id:short(attrs.id)};
   const handlers=Object.keys(attrs).filter(k=>/^on[A-Z]/.test(k));
   if(['button','a','Link','summary'].includes(tag)||handlers.includes('onClick')){
    const handlersText=Object.fromEntries(handlers.map(k=>[k,short(attrs[k])]));
    inventory.interactions.push({...base,type:short(attrs.type),href:short(attrs.href),handlers:handlersText,disabled:short(attrs.disabled),ariaDisabled:short(attrs['aria-disabled']),behavior:'not individually executed; see E2E evidence'});
    if(tag==='button'&&!attrs.onClick&&!attrs.type)inventory.candidates.push({...at(n),reason:'implicit-submit-or-context-handler',classification:'review only; parent form/event delegation may be valid'});
    for(const name of handlers){const expr=attrs[name];if(expr&&ts.isJsxExpression(expr)&&expr.expression&&(ts.isArrowFunction(expr.expression)||ts.isFunctionExpression(expr.expression))&&ts.isBlock(expr.expression.body)&&expr.expression.body.statements.length===0)inventory.candidates.push({...at(n),reason:'empty-handler',handler:name,classification:'static confirmed; user impact requires reproduction'});}
   }
   if(tag==='form')inventory.forms.push({...base,onSubmit:short(attrs.onSubmit),action:short(attrs.action),noValidate:'noValidate' in attrs,verification:'manual/runtime validation required'});
   if(['input','select','textarea'].includes(tag))inventory.fields.push({...base,type:short(attrs.type),required:'required' in attrs,value:short(attrs.value),defaultValue:short(attrs.defaultValue),onChange:short(attrs.onChange),ariaInvalid:short(attrs['aria-invalid']),ariaDescribedby:short(attrs['aria-describedby'])});
   if(attrs.href){const value=attrs.href;inventory.navigation.push({...at(n),kind:tag+' href',expression:short(value),literal:ts.isStringLiteral(value)?value.text:ts.isJsxExpression(value)&&value.expression&&ts.isStringLiteralLike(value.expression)?value.expression.text:null});}
  }
  if(ts.isCallExpression(n)){
   const callee=text(n.expression), args=n.arguments.map(short);
   if(/(?:^|\.)(?:redirect|permanentRedirect|push|replace|assign)$/.test(callee))inventory.navigation.push({...at(n),kind:callee,expression:args[0]??'',literal:n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0])?n.arguments[0].text:null});
   if(callee==='fetch'||/\.(?:rpc|from)$/.test(callee))inventory.apiCalls.push({...at(n),kind:callee,args});
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
}
for(const file of walk(join(root,'tests/e2e')).filter(f=>/\.spec\.ts$/.test(f))){const s=readFileSync(file,'utf8');inventory.tests.push({file:relative(root,file),declarations:(s.match(/\btest\s*\(/g)||[]).length,scope:'declarations only; loops/projects expand at runtime; assertions may use mocked API'});}
inventory.summary=Object.fromEntries(['routes','interactions','forms','fields','navigation','apiCalls','candidates','tests'].map(k=>[k,inventory[k].length]));
mkdirSync(out,{recursive:true});writeFileSync(join(out,'inventory.json'),JSON.stringify(inventory,null,2));
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
for(const key of ['routes','interactions','forms','fields','navigation','apiCalls','candidates','tests']){const rows=inventory[key];const cols=[...new Set(rows.flatMap(Object.keys))];writeFileSync(join(out,key+'.csv'),'\uFEFF'+[cols.map(quote).join(','),...rows.map(r=>cols.map(c=>quote(typeof r[c]==='object'?JSON.stringify(r[c]):r[c])).join(','))].join('\n'));}
console.log(JSON.stringify(inventory.summary,null,2));
