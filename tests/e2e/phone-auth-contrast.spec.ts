import {expect,test} from '@playwright/test';
import {syntheticSession} from './fixtures/department-workspaces.mjs';
const api=process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
for(const destination of ['/app/profile','/pro'])test(`phone registration without email rejects an invalid code then completes the verified flow toward ${destination}`,async({page})=>{
 let sent=0,verified=0,professional=0;
 await page.route('**/api/auth/providers',r=>r.fulfill({json:{google:false,whatsapp:true}}));
 await page.route(`${api}/auth/v1/otp`,r=>{const body=r.request().postDataJSON();expect(body.phone).toBe('+221770000099');expect(body).not.toHaveProperty('email');expect(body.create_user).toBe(true);expect(body.data).toMatchObject({display_name:'Compte téléphone QA',legal_accepted:true,country_code:'SN'});sent++;return r.fulfill({json:{}});});
 const session=syntheticSession('client');session.user.email='';
 await page.route(`${api}/auth/v1/user`,r=>r.fulfill({json:session.user}));
 await page.route('**/api/auth/welcome',r=>r.fulfill({json:{status:'not_applicable'}}));
 await page.route(`${api}/auth/v1/verify`,r=>{verified++;return verified===1?r.fulfill({status:403,json:{code:'otp_expired',msg:'Invalid code'}}):r.fulfill({json:session});});
 await page.route(`${api}/rest/v1/rpc/request_professional_profile`,r=>{professional++;return r.fulfill({json:null});});
 await page.goto('/?connexion=requise&returnTo='+encodeURIComponent(destination));
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Téléphone (WhatsApp)',exact:true}).click();await dialog.getByRole('button',{name:'Créer un compte',exact:true}).click();
 await dialog.getByLabel('Nom complet',{exact:true}).fill('Compte téléphone QA');await dialog.getByRole('combobox',{name:'Pays de résidence',exact:true}).selectOption('SN');await dialog.getByLabel('Numéro WhatsApp avec indicatif',{exact:true}).fill('+221 77 000 00 99');
 await expect(dialog.locator('input[type=email],input[type=password]')).toHaveCount(0);
 const send=dialog.getByRole('button',{name:'Recevoir mon code sur WhatsApp',exact:true});await expect(send).toBeDisabled();await dialog.getByRole('checkbox').check();await send.click();
 await dialog.getByLabel('Code reçu sur WhatsApp',{exact:true}).fill('123456');await dialog.getByRole('button',{name:'Valider mon code',exact:true}).click();await expect(dialog.getByText(/Code invalide, expiré/)).toBeVisible();expect(sent).toBe(1);expect(verified).toBe(1);expect(professional).toBe(0);
 await dialog.getByLabel('Code reçu sur WhatsApp',{exact:true}).fill('654321');await dialog.getByRole('button',{name:'Valider mon code',exact:true}).click();
 await expect(page).toHaveURL(destination==='/pro'?/\/app\/application$/:/\/app\/profile$/);
 expect(verified).toBe(2);if(destination==='/pro')expect(professional).toBeGreaterThanOrEqual(1);
});
test('WhatsApp remains honestly unavailable before Meta activation',async({page})=>{
 await page.route('**/api/auth/providers',r=>r.fulfill({json:{google:false,whatsapp:false}}));await page.goto('/?connexion=requise');const dialog=page.getByRole('dialog',{name:'Se connecter',exact:true});await dialog.getByRole('button',{name:'Téléphone (WhatsApp)',exact:true}).click();await expect(dialog.getByText(/La connexion par WhatsApp est en cours d’activation/)).toBeVisible();await expect(dialog.getByRole('button',{name:'Recevoir mon code sur WhatsApp',exact:true})).toHaveCount(0);
});
test('professional settings shortcuts match readable light surfaces',async({page,context})=>{
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(syntheticSession('provider'))).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);await page.goto('/pro/settings');const links=page.locator('.profile-shortcuts a');await expect(links).toHaveCount(6);
 expect(await links.evaluateAll(nodes=>nodes.map(node=>{const style=getComputedStyle(node);return {color:style.color,background:style.backgroundColor};}))).toEqual(Array.from({length:6},()=>({color:'rgb(48, 33, 42)',background:'rgb(255, 255, 255)'})));
 await links.first().hover();await expect(links.first()).toHaveCSS('color','rgb(255, 255, 255)');await expect(links.first()).toHaveCSS('background-color','rgb(134, 18, 79)');
});
