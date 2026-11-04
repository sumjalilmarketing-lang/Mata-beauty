import {expect,test,type BrowserContext} from '@playwright/test';
import {syntheticSession} from './fixtures/department-workspaces.mjs';
const api=process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
async function login(context:BrowserContext,role:string){const session=syntheticSession(role);await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);}

test('client : les paramètres ouvrent les formulaires, les modifications et la confidentialité',async({page,context})=>{
 await login(context,'client');
 await page.goto('/app/profile');
 await expect(page.getByRole('button',{name:'Modifier mon profil',exact:true})).toBeVisible();
 const install=page.locator('.workspace-install-help');await expect(install).toBeVisible();await expect(install).not.toHaveAttribute('open','');await install.locator('summary').click();await expect(install.getByText(/iPhone et iPad : Safari/)).toBeVisible();await expect(install.getByText(/Téléphone et tablette Android/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await install.locator('summary').click();await expect(install).not.toHaveAttribute('open','');
 await page.getByRole('link',{name:'Paramètres et confidentialité',exact:true}).click();
 await expect(page).toHaveURL(/\/app\/profile\?edit=1/);
 await expect(page.getByRole('heading',{name:'Identité',exact:true})).toBeVisible();
 let saved=false;
 await page.route(`${api}/rest/v1/rpc/update_client_identity_global`,route=>{const body=route.request().postDataJSON();expect(body.target_first_name).toBe('Client modifié');expect(body).not.toHaveProperty('target_user_id');saved=true;return route.fulfill({json:null});});
 await page.getByLabel('Prénom',{exact:true}).fill('Client modifié');
 await page.locator('#edit-client-profile').getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByText('Profil mis à jour.',{exact:true})).toBeVisible();expect(saved).toBe(true);
 await expect(page.getByRole('heading',{name:'Confidentialité et compte',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('client : une panne des paiements affiche une erreur et permet la reprise',async({page,context})=>{
 await login(context,'client');let failed=true;
 await page.route(`${api}/rest/v1/payments**`,route=>route.fulfill(failed?{status:403,json:{message:'fixture unavailable'}}:{json:[{id:'payment-test',amount:35,currency:'EUR',is_test:true,payment_method:'card',payment_status:'paid',provider_reference:null,created_at:'2026-11-03T12:00:00Z',bookings:{provider_services:{title:'Prestation de recette'}}}]}));
 await page.goto('/app/payments');
 await expect(page.locator('#client-payments [role=alert]')).toContainText('Les paiements n’ont pas pu être chargés.',{timeout:15000});
 await expect(page.getByText('Aucun paiement enregistré.',{exact:true})).toHaveCount(0);
 failed=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();
 await expect(page.getByText('Prestation de recette',{exact:true})).toBeVisible();
 await expect(page.getByText('Paiement de test · aucun argent réel',{exact:true})).toBeVisible();
});

test('client : routes privées financières et administration refusées',async({page,context})=>{
 await login(context,'client');
 for(const path of ['/finance','/finance/transactions','/finance/refunds','/admin/teams']){
  await page.goto(path);await expect(page).toHaveURL(/acces=refuse/);
  await expect(page.getByRole('heading',{name:'Finance et comptabilité',exact:true})).toHaveCount(0);
 }
 await page.goto('/auth/workspace?role=super_admin&next=/finance');await expect(page).toHaveURL(/\/app\/profile$/);
});

test('finance : synthèse par devise et séparation réel/test, panne et reprise',async({page,context})=>{
 await login(context,'finance_manager');let failed=false;
 await page.route(`${api}/rest/v1/rpc/finance_payment_overview`,route=>route.fulfill(failed?{status:403,json:{message:'fixture unavailable'}}:{json:[{currency:'EUR',test_mode:false,payment_count:2,online_collected:35,on_site_collected:10,refunds_recorded:5,commissions_recorded:3,professional_net_recorded:32,pending_amount:0},{currency:'XOF',test_mode:true,payment_count:151,online_collected:15100,on_site_collected:0,refunds_recorded:0,commissions_recorded:1510,professional_net_recorded:13590,pending_amount:0}]}));
 await page.goto('/auth/workspace?role=super_admin');await expect(page).toHaveURL(/\/finance$/);
 await expect(page.getByRole('region',{name:'Synthèse EUR'})).toContainText(/35,00\s*EUR/);
 await expect(page.getByRole('region',{name:'Synthèse XOF'})).toHaveCount(0);
 await page.getByLabel('Mode des paiements').selectOption('test');
 await expect(page.getByRole('region',{name:'Synthèse XOF'})).toContainText('151 paiement(s)');
 await expect(page.getByRole('status')).toContainText('ne constituent pas de l’argent réellement encaissé');
 failed=true;await page.getByRole('button',{name:'Actualiser la synthèse'}).click();await expect(page.getByRole('alert').filter({hasText:'Synthèse indisponible'})).toContainText('Synthèse indisponible');
 failed=false;await page.getByRole('button',{name:'Actualiser la synthèse'}).click();await expect(page.getByRole('region',{name:'Synthèse XOF'})).toBeVisible();
 for(const path of ['transactions','pending','failed','refunds','commissions','wallets','payouts','reconciliation','anomalies','accounting','audit','teams','cases']){
  await page.goto('/finance/'+path);expect(page.url()).toContain('/finance/'+path);await expect(page.getByRole('heading',{name:'Cette page n’existe pas'})).toHaveCount(0);
 }
 await page.goto('/admin/teams');await expect(page).toHaveURL(/\/finance$/);
});

test('finance : après mot de passe, le responsable rejoint son département',async({page,context})=>{
 await login(context,'finance_manager');
 await page.route('**/api/admin/team/activate',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/auth/v1/token?**',route=>route.fulfill({json:syntheticSession('finance_manager'),headers:{'Access-Control-Allow-Origin':new URL(page.url()).origin}}));
 await page.goto('/auth/update-password?mode=invite&team=1');
 await page.getByLabel('Nouveau mot de passe',{exact:true}).fill('Synthetic-Only-Password-2026!');await page.getByLabel('Confirmation',{exact:true}).fill('Synthetic-Only-Password-2026!');
 await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(page.locator('.auth-feedback')).toContainText('Mot de passe mis à jour');
 await page.getByRole('link',{name:'Rejoindre mon espace',exact:true}).click();await page.getByLabel('Adresse e-mail').fill('finance_manager@example.test');await page.locator('input[name="password"]').fill('Synthetic-Only-Password-2026!');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await expect(page).toHaveURL(/\/finance$/);await expect(page.getByRole('heading',{name:'Finance et comptabilité',exact:true})).toBeVisible();
});

test('client : une photo sans ligne modifiée ne produit pas de faux succès',async({page,context})=>{
 await login(context,'client');
 await page.route(`${api}/storage/v1/object/avatars/**`,route=>route.fulfill({json:{Key:'avatars/synthetic.png'}}));
 await page.route(`${api}/rest/v1/profiles**`,route=>route.request().method()==='PATCH'?route.fulfill({json:null}):route.fallback());
 await page.goto('/app/profile?edit=1');
 await page.getByLabel('Photo de profil',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
 await expect(page.getByText('La photo n’a pas pu être enregistrée.',{exact:true})).toBeVisible();
 await expect(page.getByText('Photo mise à jour.',{exact:true})).toHaveCount(0);
});

test('client : le support distingue une panne et une demande privée enregistrée',async({page,context})=>{
 await login(context,'client');let failed=true,sent=false;
 await page.route(`${api}/rest/v1/support_tickets**`,route=>{
  if(route.request().method()==='POST'){const data=route.request().postDataJSON();expect(data.requester_id).toBe(syntheticSession('client').user.id);sent=true;return route.fulfill({json:null});}
  expect(new URL(route.request().url()).searchParams.get('requester_id')).toBe('eq.'+syntheticSession('client').user.id);
  return route.fulfill(failed?{status:403,json:{message:'fixture unavailable'}}:{json:sent?[{id:'ticket-test',subject:'Aide sur ma réservation',status:'open',created_at:'2026-11-03T12:00:00Z'}]:[]});
 });
 await page.goto('/app/support');await expect(page.locator('#client-support [role=alert]')).toContainText('Les demandes de support n’ont pas pu être chargées.');
 failed=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.locator('#client-support [role=alert]')).toHaveCount(0);
 await page.getByLabel('Objet (obligatoire)').fill('Aide sur ma réservation');await page.getByRole('button',{name:'Envoyer',exact:true}).click();
 await expect(page.getByText('Demande envoyée au support.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Aide sur ma réservation',exact:true})).toBeVisible();
});

test('client : création de mot de passe puis connexion au profil personnel',async({page,context})=>{
 await login(context,'client');
 await page.route('**/auth/v1/token?**',route=>route.fulfill({json:syntheticSession('client'),headers:{'Access-Control-Allow-Origin':new URL(page.url()).origin}}));
 await page.goto('/auth/update-password?mode=recovery');await page.getByLabel('Nouveau mot de passe',{exact:true}).fill('Synthetic-Only-Password-2026!');await page.getByLabel('Confirmation',{exact:true}).fill('Synthetic-Only-Password-2026!');await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();await expect(page.locator('.auth-feedback')).toContainText('Mot de passe mis à jour');
 await page.getByRole('link',{name:'Rejoindre mon espace',exact:true}).click();await page.getByLabel('Adresse e-mail').fill('client@example.test');await page.locator('input[name="password"]').fill('Synthetic-Only-Password-2026!');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await expect(page).toHaveURL(/\/app\/profile$/);await expect(page.getByRole('button',{name:'Modifier mon profil',exact:true})).toBeVisible();
});
