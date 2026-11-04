import {expect,test} from '@playwright/test';
import {syntheticId,syntheticSession} from './fixtures/department-workspaces.mjs';
const api=process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
test('collaborateur : horaires personnels, période complète et notifications sans espace financier',async({page,context})=>{
 test.skip(process.env.MATA_E2E_COLLABORATOR_ACCESS_ENABLED!=='true','Collaborator build required');
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(syntheticSession('staff'))).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
 const employee=syntheticId(801);let saved=false,blocked=false;
 await page.route(`${api}/rest/v1/rpc/get_my_collaborator_calendar`,r=>r.fulfill({json:[{id:employee,salon_name:'Kincoaf QA',time_zone:'Africa/Dakar',is_bookable:true,hours:saved?[{id:syntheticId(951),weekday:1,starts_at:'10:00:00',ends_at:'22:00:00'}]:[],absences:blocked?[{id:syntheticId(952),starts_at:'2027-01-04T12:00:00Z',ends_at:'2027-01-04T18:00:00Z',kind:'rest',reason:'Planning complet'}]:[],services:['Tresses'],conflicts:blocked?1:0}]}));
 await page.route(`${api}/rest/v1/rpc/staff_add_working_hours`,r=>{expect(r.request().postDataJSON()).toEqual({target_collaborator:employee,target_weekday:1,target_start:'10:00',target_end:'22:00'});saved=true;return r.fulfill({json:syntheticId(951)});});
 await page.route(`${api}/rest/v1/rpc/staff_add_unavailability`,r=>{expect(r.request().postDataJSON()).toEqual({target_collaborator:employee,target_start:'2027-01-04T12:00:00.000Z',target_end:'2027-01-04T18:00:00.000Z',target_kind:'rest',target_reason:'Planning complet'});blocked=true;return r.fulfill({json:syntheticId(952)});});
 await page.goto('/staff/availability');
 await expect(page.getByRole('combobox',{name:'Mon salon',exact:true})).toHaveValue(employee);
 await page.getByRole('combobox',{name:'Jour',exact:true}).selectOption('1');await page.getByLabel('Début de travail',{exact:true}).fill('10:00');await page.getByLabel('Fin de travail',{exact:true}).fill('22:00');await page.getByRole('button',{name:'Ajouter cet horaire',exact:true}).click();
 await expect(page.getByText('Lundi · 10:00–22:00',{exact:true})).toBeVisible();
 await page.getByLabel('Indisponible à partir du',{exact:true}).fill('2027-01-04T12:00');await page.getByLabel('Indisponible jusqu’au',{exact:true}).fill('2027-01-04T18:00');await page.getByLabel('Motif (facultatif)',{exact:true}).fill('Planning complet');await page.getByRole('button',{name:'Bloquer cette période',exact:true}).click();
 await expect(page.getByText(/Indisponibilité enregistrée. Le responsable est informé/)).toBeVisible();await expect(page.getByRole('link',{name:'Ouvrir mon agenda pour les réattribuer',exact:true})).toBeVisible();expect(saved&&blocked).toBe(true);
 await page.goto('/staff/notifications');await expect(page.getByRole('heading',{name:'Mes notifications',exact:true}).last()).toBeVisible();
 await page.goto('/finance');await expect(page).toHaveURL(/acces=refuse/);
});
