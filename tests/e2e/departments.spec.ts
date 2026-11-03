import {expect,test,type BrowserContext}from "@playwright/test";
import {syntheticSession,departmentContext,departmentCase}from "./fixtures/department-workspaces.mjs";
async function login(context:BrowserContext,role:string){const session=syntheticSession(role);await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);}
test('entrée par lien : le responsable commercial rejoint son CRM et ses équipes',async({page,context})=>{
 await login(context,'commercial_manager');
 await page.goto('/auth/workspace?role=super_admin&next=/admin');
 await expect(page).toHaveURL(/\/commercial$/);
 await expect(page.getByRole('heading',{name:'Vue commerciale',exact:true})).toBeVisible();
 await page.goto('/commercial/teams');
 await expect(page.getByRole('heading',{name:'Mes équipes · Commercial'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Suivi des agents'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Créer une équipe'})).toHaveCount(0);
});
test('responsable : équipe, recrutement et invitation par lien conservé après actualisation',async({page,context})=>{
 await login(context,'commercial_manager');const data=departmentContext('commercial_manager');
 await page.route('**/api/department-teams',async route=>{if(route.request().method()==='GET')return route.fulfill({json:data});const body=route.request().postDataJSON();if(body.action==='member'){expect(body).not.toHaveProperty('role');data.members.push({...data.members[0],user_id:'aaaaaaaa-aaaa-4aaa-8aaa-000000000090',email:body.email,display_name:'Agent ajouté'});return route.fulfill({json:{ok:true}});}expect(body.action).toBe('invite');expect(body.channel).toBe('link');return route.fulfill({json:{ok:true,link:'http://127.0.0.1/auth/confirm?type=invite&token_hash=synthetic-ui-token'}});});
 await page.goto('/commercial/teams');await expect(page.getByRole('heading',{name:'Mes équipes · Commercial'})).toBeVisible();await expect(page.getByRole('button',{name:'Créer une équipe'})).toHaveCount(0);
 await page.getByLabel('Email du compte confirmé').fill('agent-added@example.test');await page.getByLabel('Motif de l’accès').fill('Recrutement recette');await page.getByRole('button',{name:'Ajouter l’agent',exact:true}).click();await expect(page.locator('strong').filter({hasText:/^Agent ajouté$/})).toBeVisible();
 await page.getByLabel('Prénom',{exact:true}).fill('Agent');await page.getByLabel('Nom',{exact:true}).fill('Recette');await page.getByLabel('Email',{exact:true}).fill('invite@example.test');await page.getByLabel('Transmission').selectOption('link');await page.getByRole('button',{name:'Préparer l’invitation',exact:true}).click();await expect(page.getByLabel('Lien personnel de l’invitation')).toHaveValue(/synthetic-ui-token/);await expect(page.getByRole('heading',{name:'Suivi des agents'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('finance : espace agent limité aux dossiers, suivi et refus des routes administratives',async({page,context})=>{
 await login(context,'finance_agent');const item=departmentCase('finance_agent');const rpc=`${process.env.MATA_SUPABASE_FIXTURE_ORIGIN}/rest/v1/rpc/`;
 await page.route(rpc+'department_case_detail',route=>route.fulfill({json:{case:item,events:[],payment:{amount:5000,currency:'XOF',status:'paid',is_test:true}}}));
 await page.route(rpc+'department_update_case',route=>{const b=route.request().postDataJSON();expect(b.target_version).toBe(1);item.status=b.new_status;item.version++;return route.fulfill({json:null});});
 await page.goto('/finance');await expect(page.getByRole('heading',{name:'Dossiers attribués',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Transactions',exact:true})).toHaveCount(0);await page.getByRole('button',{name:/Dossier attribué de recette/}).click();await expect(page.getByText('Paiement de test / simulation',{exact:true})).toBeVisible();await page.locator('select[name="status"]').selectOption('completed');await page.getByLabel('Compte rendu').fill('Contrôle terminé');await page.getByRole('button',{name:'Enregistrer le suivi'}).click();await expect(page.getByText('Compte rendu et statut enregistrés.')).toBeVisible();
 await page.goto('/admin/teams');await expect(page).toHaveURL(/\/finance$/);await page.goto('/finance/transactions');await expect(page).toHaveURL(/\/finance$/);
});
test('support : compte rendu et réponse client avec note interne par défaut',async({page,context})=>{
 await login(context,'support_agent');const item=departmentCase('support_agent');const messages:{id:string;body:string;is_internal:boolean;created_at:string}[]=[];const rpc=`${process.env.MATA_SUPABASE_FIXTURE_ORIGIN}/rest/v1/rpc/`;
 await page.route(rpc+'department_case_detail',route=>route.fulfill({json:{case:item,events:[],ticket:{subject:'Demande de recette',status:'open',priority:'normal'},messages}}));
 await page.route(rpc+'department_reply_case',route=>{const b=route.request().postDataJSON();messages.push({id:String(messages.length),body:b.message,is_internal:b.internal_note,created_at:new Date().toISOString()});return route.fulfill({json:null});});
 await page.goto('/support-agent');await page.getByRole('button',{name:/Dossier attribué de recette/}).click();await expect(page.getByLabel('Note interne uniquement')).toBeChecked();await page.getByLabel('Réponse',{exact:true}).fill('Réponse visible par le client');await page.getByLabel('Note interne uniquement').uncheck();await page.getByRole('button',{name:'Enregistrer le message'}).click();await expect(page.getByText('Réponse visible par le client',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Utilisateurs',exact:true})).toHaveCount(0);
});
test('super admin : création de branche avec responsable confirmé et motif',async({page,context})=>{
 await login(context,'super_admin');const data=departmentContext('super_admin');await page.route('**/api/department-teams',route=>{if(route.request().method()==='GET')return route.fulfill({json:data});const body=route.request().postDataJSON();expect(body.action).toBe('team');expect(body.department).toBe('finance');expect(body.managerEmail).toBe('head@example.test');return route.fulfill({json:{ok:true,id:data.teams[0].id}});});await page.goto('/admin/teams');await page.getByRole('button',{name:'Créer une équipe'}).click();await page.getByLabel('Nom de l’équipe').fill('Finance Thiès');await page.getByRole('combobox',{name:'Service',exact:true}).selectOption('finance');await page.getByLabel('Email du responsable').fill('head@example.test');await page.locator('form').filter({has:page.getByRole('button',{name:'Enregistrer la délégation',exact:true})}).getByLabel('Motif',{exact:true}).fill('Délégation recette');await page.getByRole('button',{name:'Enregistrer la délégation'}).click();await expect(page.getByText(/Modification enregistrée/)).toBeVisible();
});

test('responsable finance : remboursements consultables sans décision ni transfert',async({page,context})=>{await login(context,'finance_manager');await page.route(`${process.env.MATA_SUPABASE_FIXTURE_ORIGIN}/rest/v1/refunds**`,route=>route.fulfill({json:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-000000000401',payment_id:'aaaaaaaa-aaaa-4aaa-8aaa-000000000301',amount:5000,status:'requested',reason:'Demande de remboursement de recette',created_at:'2026-11-03T12:00:00Z',payments:{currency:'XOF'}}]}));await page.goto('/finance/refunds');await expect(page.getByRole('heading',{name:'Demandes de remboursement'})).toBeVisible();await expect(page.getByText('Demande de remboursement de recette',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Examiner la demande'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Décision sur la demande'})).toHaveCount(0);});

test('création du mot de passe : entrée complète puis connexion vers l’espace commercial',async({page,context})=>{
 await login(context,'commercial_manager');
 await page.route('**/api/admin/team/activate',route=>route.fulfill({json:{ok:true}}));
 await page.route('**/auth/v1/token?**',route=>route.fulfill({json:syntheticSession('commercial_manager'),headers:{'Access-Control-Allow-Origin':new URL(page.url()).origin}}));
 await page.goto('/auth/update-password?mode=invite&team=1');
 await page.getByLabel('Nouveau mot de passe',{exact:true}).fill('Synthetic-Only-Password-2026!');
 await page.getByLabel('Confirmation',{exact:true}).fill('Synthetic-Only-Password-2026!');
 await page.getByRole('button',{name:'Mettre à jour',exact:true}).click();
 await expect(page.locator('.auth-feedback')).toContainText('Mot de passe mis à jour');
 let documentNavigation=false;
 page.on('request',request=>{if(new URL(request.url()).pathname==='/auth/workspace'&&request.isNavigationRequest())documentNavigation=true;});
 await page.getByRole('link',{name:/Rejoindre mon espace/}).click();
 await expect(page.getByRole('heading',{name:'Cette page n’existe pas'})).toHaveCount(0);
 await expect(page.getByLabel('Adresse e-mail')).toBeVisible();
 expect(documentNavigation).toBe(true);
 await page.getByLabel('Adresse e-mail').fill('commercial_manager@example.test');
 await page.locator('input[name="password"]').fill('Synthetic-Only-Password-2026!');
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await expect(page).toHaveURL(/\/commercial$/);
 await expect(page.getByRole('heading',{name:'Vue commerciale',exact:true})).toBeVisible();
});
