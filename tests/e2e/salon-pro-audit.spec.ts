import {expect,test,type BrowserContext} from '@playwright/test';
import {syntheticSession} from './fixtures/department-workspaces.mjs';
import {auditBusiness,auditService,auditBooking,auditMedia} from './fixtures/provider-audit.mjs';
const api=process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
async function login(context:BrowserContext,role='provider'){const session=syntheticSession(role);await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);}

test('pro : une réservation devenue inaccessible ne produit pas de faux succès',async({page,context})=>{
 await login(context);let changes=0;
 await page.route(`${api}/rest/v1/bookings**`,route=>{if(route.request().method()!=='PATCH')return route.fallback();const url=new URL(route.request().url());expect(url.searchParams.get('id')).toBe('eq.'+auditBooking);expect(url.searchParams.get('status')).toBe('eq.pending');changes++;return route.fulfill({json:null});});
 await page.goto('/pro/bookings');await page.getByRole('button',{name:'Accepter',exact:true}).click();
 await expect(page.getByText('La réservation a changé ou n’est plus accessible. Actualisez la liste.',{exact:true})).toBeVisible();await expect(page.getByText('Réservation mise à jour.',{exact:true})).toHaveCount(0);expect(changes).toBe(1);
});

test('salon : réservation sous statut attendu et périmètre du salon',async({page,context})=>{
 await login(context);let saved=false;
 await page.route(`${api}/rest/v1/bookings**`,route=>{if(route.request().method()!=='PATCH')return route.fallback();const params=new URL(route.request().url()).searchParams;expect(params.get('business_id')).toBe('eq.'+auditBusiness);expect(params.get('status')).toBe('eq.pending');return route.fulfill({json:saved?{id:auditBooking}:null});});
 await page.goto('/salon/bookings');await page.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(page.getByText('La réservation a changé ou n’est plus accessible. Actualisez la liste.',{exact:true})).toBeVisible();
 saved=true;await page.getByRole('button',{name:'Confirmer',exact:true}).click();await expect(page.getByText('Réservation mise à jour.',{exact:true})).toBeVisible();
});

test('salon : modifier une prestation exige une ligne, puis conserve le taux d’acompte',async({page,context})=>{
 await login(context);let success=false;
 await page.route(`${api}/rest/v1/provider_services**`,route=>{if(route.request().method()!=='PATCH')return route.fallback();const params=new URL(route.request().url()).searchParams;expect(params.get('business_id')).toBe('eq.'+auditBusiness);expect(params.get('provider_id')).toBe('eq.'+syntheticSession('provider').user.id);const data=route.request().postDataJSON();expect(data.deposit_percentage).toBe(60);return route.fulfill({json:success?{id:auditService,business_id:auditBusiness,service_id:'aaaaaaaa-aaaa-4aaa-8aaa-000000000503',title:data.title,description:null,duration_minutes:60,price_amount:10000,currency:'XOF',deposit_percentage:60,is_active:true,archived_at:null,updated_at:'2026-11-03T13:00:00Z'}:null});});
 await page.goto('/salon/services');const editor=page.getByRole('region',{name:'Prestation Prestation de recette'});await editor.getByRole('button',{name:'Modifier',exact:true}).click();await editor.getByLabel('Acompte prévu (%)').fill('60');await editor.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(editor.getByText(/Cette prestation a changé/)).toBeVisible();
 success=true;await editor.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(editor.getByText(/Prestation modifiée/)).toBeVisible();await editor.getByRole('button',{name:'Modifier',exact:true}).click();await expect(editor.getByLabel('Acompte prévu (%)')).toHaveValue('60');
});

test('salon : la visibilité et le profil ne sont confirmés que si enregistrés',async({page,context})=>{
 await login(context);await page.route(`${api}/rest/v1/businesses**`,route=>route.request().method()==='PATCH'?route.fulfill({json:null}):route.fallback());
 await page.goto('/salon/settings');await page.getByRole('button',{name:'Désactiver',exact:true}).click();await expect(page.getByText('La visibilité n’a pas pu être modifiée. Actualisez le salon.',{exact:true})).toBeVisible();await expect(page.getByText('Visibilité mise à jour.',{exact:true})).toHaveCount(0);
 await page.goto('/salon/profile');await page.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();await expect(page.getByText(/Enregistrement non confirmé/)).toBeVisible();
});

test('salon : un média refusé par la base conserve son fichier',async({page,context})=>{
 await login(context);let storageDeletes=0;
 await page.route(`${api}/rest/v1/business_media**`,route=>{if(route.request().method()!=='DELETE')return route.fallback();expect(new URL(route.request().url()).searchParams.get('business_id')).toBe('eq.'+auditBusiness);expect(new URL(route.request().url()).searchParams.get('id')).toBe('eq.'+auditMedia);return route.fulfill({json:null});});
 await page.route(`${api}/storage/v1/object/business-media`,route=>{storageDeletes++;return route.fulfill({json:[]});});
 await page.goto('/salon/portfolio');await page.getByRole('button',{name:'Retirer',exact:true}).click();await expect(page.getByText('Le média n’a pas pu être retiré. Le fichier est conservé.',{exact:true})).toBeVisible();expect(storageDeletes).toBe(0);
});

test('salon : panne de chargement distincte d’un salon vide et reprise',async({page,context})=>{
 await login(context);let failed=true;await page.route(`${api}/rest/v1/businesses**`,route=>failed&&route.request().method()==='GET'?route.fulfill({status:403,json:{message:'fixture unavailable'}}):route.fallback());
 await page.goto('/salon');await expect(page.getByText('Données indisponibles',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Créer votre salon',exact:true})).toHaveCount(0);failed=false;await page.getByRole('button',{name:'Réessayer',exact:true}).click();await expect(page.getByRole('heading',{name:'Salon de recette',exact:true})).toBeVisible();
});

test('pro et salon : navigation et menu Plus, client refusé aux espaces professionnels',async({page,context})=>{
 await login(context);
 for(const path of ['/pro','/pro/services','/pro/settings','/pro/agenda','/pro/team','/salon','/salon/services','/salon/agenda','/salon/team','/salon/settings','/salon/reviews','/salon/statistics']){await page.goto(path);expect(page.url()).toContain(path);await expect(page.getByRole('heading',{name:'Cette page n’existe pas'})).toHaveCount(0);}
 if((page.viewportSize()?.width??1280)<768){await page.getByRole('button',{name:'Plus',exact:true}).click();await expect(page.getByRole('dialog',{name:'Plus',exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByRole('link',{name:/Paramètres/})).toBeVisible();}
 await context.clearCookies();await login(context,'client');await page.goto('/pro/services');await expect(page).not.toHaveURL(/\/pro\/services$/);await page.goto('/salon/team');await expect(page).not.toHaveURL(/\/salon\/team$/);
});

for(const legacy of [false,true]) test(`salon : une nouvelle prestation sans horaires reste en brouillon (schéma ${legacy?'ancien':'commercial'})`,async({page,context})=>{
 await login(context);let attempts=0;
 await page.route(`${api}/rest/v1/business_hours**`,route=>route.fulfill({json:[]}));
 await page.route(`${api}/rest/v1/provider_services**`,route=>{
  if(route.request().method()!=='POST')return route.fallback();attempts++;const body=route.request().postDataJSON();expect(body.is_active).toBe(false);expect(body.business_id).toBe(auditBusiness);
  if(attempts===1){expect(body.status).toBe('draft');if(legacy)return route.fulfill({status:400,json:{code:'PGRST204',message:"Could not find the 'status' column of 'provider_services' in the schema cache"}});}
  else expect(body).not.toHaveProperty('status');
  return route.fulfill({json:null});
 });
 await page.goto('/salon/services');await page.locator('select[name="serviceId"]').first().selectOption('aaaaaaaa-aaaa-4aaa-8aaa-000000000503');await page.locator('input[name="title"]').fill('Nouvelle prestation');await page.locator('input[name="duration"]').fill('60');await page.locator('input[name="price"]').fill('10000');await page.getByRole('button',{name:'Ajouter la prestation',exact:true}).click();
 await expect(page.getByText('Prestation enregistrée en brouillon. Publiez vos horaires pour l’activer.',{exact:true})).toBeVisible();expect(attempts).toBe(legacy?2:1);
});


test('pro : un suivi de configuration vide ne bloque pas le tableau de bord et permet la reprise',async({page,context})=>{
 await login(context);let unavailable=true;
 await page.route(`${api}/rest/v1/rpc/get_provider_launch_checklist`,route=>route.fulfill({json:unavailable?null:{score:100,photo:true,description:true,services:1,prices:1,availability:true,portfolio:1,video:true,verified:true,ready:true}}));
 await page.goto('/pro');
 await expect(page.getByText('Le suivi de configuration est momentanément indisponible. Votre activité reste accessible.',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Un problème est survenu',exact:true})).toHaveCount(0);
 unavailable=false;await page.getByRole('button',{name:'Réessayer le suivi de configuration',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'5 étapes sur 5'})).toBeVisible();
});

test('salon : une actualisation des réservations conserve la prestation en cours de modification', async ({ page, context }) => {
 await login(context);
 let bookingReads = 0;
 await page.route(`${api}/rest/v1/bookings**`, async route => {
  if (route.request().method() === 'GET') bookingReads++;
  return route.fallback();
 });
 await page.goto('/salon/services');
 const editor = page.getByRole('region', { name: 'Prestation Prestation de recette' });
 await editor.getByRole('button', { name: 'Modifier', exact: true }).click();
 const title = editor.getByLabel('Nom de votre prestation', { exact: true });
 await title.fill('Tresses en cours de modification');
 const previousReads = bookingReads;
 await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 await expect.poll(() => bookingReads).toBeGreaterThan(previousReads);
 await expect(title).toHaveValue('Tresses en cours de modification');
});
