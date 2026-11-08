import { expect, test } from "@playwright/test";
import { qaLogin } from "./helpers/qa-session";
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
const metrics = {users_total:10,users_today:0,users_week:0,clients_active:0,providers_active:0,providers_pending:0,salons_active:0,bookings_today:0,bookings_week:0,bookings_confirmed:0,bookings_cancelled:0,gross_revenue:0,commissions:0,payments_pending:0,payouts_pending:0,disputes_open:0,reports_open:0,tickets_open:0,average_order:0,financial_by_currency:[]};
for (const failure of ["http", "null"]) test(`admin dashboard: ${failure} failure has an explicit retry`, async ({ page, context }) => {
 await qaLogin(context,"super_admin");let failed=true;
 await page.route(`${api}/rest/v1/rpc/get_admin_dashboard`, route=>route.fulfill(failed ? failure==="http"?{status:500,json:{message:"fixture failure"}}:{json:null} : {json:metrics}));
 const response=await page.goto("/admin");
 expect(response?.headers()["content-security-policy"]).toContain("'nonce-");
 await expect(page.getByRole("alert").filter({hasText:"tableau de bord est indisponible"})).toBeVisible();
 failed=false;await page.getByRole("button",{name:"Réessayer le tableau de bord"}).click();
 await expect(page.getByRole("heading",{name:"Réservations enregistrées"})).toBeVisible();
});
test("support: ticket 101 is accessible and subject search resets pagination",async({page,context})=>{
 await qaLogin(context,"support");
 const rows=Array.from({length:101},(_,i)=>({id:`11111111-1111-4111-8111-${String(i+1).padStart(12,"0")}`,subject:`Demande ${String(i+1).padStart(3,"0")}`,status:"open",priority:"normal"}));
 await page.route(`${api}/rest/v1/support_tickets**`,route=>{
  const url=new URL(route.request().url()), term=url.searchParams.get("subject"), offset=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??50);
  expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
  const matches=term?rows.filter(row=>row.subject.includes("101")):rows;
  return route.fulfill({json:matches.slice(offset,offset+limit),headers:{"content-range":`${offset}-${Math.min(offset+limit,matches.length)-1}/${matches.length}`}});
 });
 await page.goto("/support-agent/tickets");
 await expect(page.getByRole("button",{name:"Demande 001",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Demandes suivantes"}).click();
 await expect(page.getByRole("button",{name:"Demande 051",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Demandes suivantes"}).click();
 await expect(page.getByRole("button",{name:"Demande 101",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Demandes suivantes"}).isDisabled().then(disabled=>expect(disabled).toBe(true));
 await page.getByRole("button",{name:"Demandes précédentes"}).click();
 await page.getByLabel("Rechercher une demande").fill("101");await page.getByRole("button",{name:"Rechercher",exact:true}).click();
 await expect(page).toHaveURL(/page=1.*q=101/);
 await expect(page.getByRole("button",{name:"Demande 101",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Demandes précédentes"})).toBeDisabled();
});
for(const role of ["finance_agent","support_agent","hr_agent"]) test(`${role}: personal settings works without a client role or client profile`,async({page,context})=>{
 await qaLogin(context,role);let saved=false;
 await page.route(`${api}/rest/v1/client_profiles**`,route=>route.fulfill({json:[]}));
 await page.route(`${api}/rest/v1/rpc/update_client_identity_global`,route=>{saved=true;expect(route.request().postDataJSON().target_first_name).toBe("Profil interne");return route.fulfill({json:null});});
 await page.goto(role==="finance_agent"?"/finance":role==="support_agent"?"/support-agent":"/admin/hr");
 await expect(page.locator('input[name="workspace-search"]')).toHaveCount(0);
 await page.getByRole("link",{name:"Mon profil et mes paramètres"}).click();
 await expect(page).toHaveURL(/\/account\/settings$/);
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content",/noindex/);
 await expect(page.getByRole("heading",{name:"Identité",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Ma candidature professionnelle",exact:true})).toHaveCount(0);
 await page.getByLabel("Prénom",{exact:true}).fill("Profil interne");
 await page.locator("#edit-client-profile").getByRole("button",{name:"Enregistrer",exact:true}).click();
 await expect(page.getByText("Profil mis à jour.",{exact:true})).toBeVisible();expect(saved).toBe(true);
});
test("anonymous personal settings redirects to sign in",async({page})=>{
 await page.goto("/account/settings");await expect(page).toHaveURL(/connexion=requise/);
});
test("sensitive confirmation traps focus, cancels with Escape, and restores the trigger",async({page,context})=>{
 await qaLogin(context,"super_admin");
 await page.route(`${api}/rest/v1/provider_profiles**`,route=>route.fulfill({json:[{profile_id:"11111111-1111-4111-8111-111111111111",business_name:"Salon audit",city:"Dakar",status:"approved",average_rating:4,review_count:1,created_at:"2026-11-01T10:00:00Z"}]}));
 await page.goto("/admin/providers");
 const trigger=page.getByRole("button",{name:"Suspendre le compte",exact:true});await trigger.focus();await page.keyboard.press("Enter");
 const dialog=page.getByRole("dialog",{name:"Suspendre Salon audit ?"});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole("button",{name:"Annuler",exact:true})).toBeFocused();
 for(let i=0;i<5;i++){await page.keyboard.press("Tab");expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test("an existing colleague review hides the second submission form while content remains sealed",async({page,context})=>{
 await qaLogin(context,"provider");
 await page.route(`${api}/rest/v1/bookings**`,route=>route.fulfill({json:[{id:"11111111-1111-4111-8111-111111111111",starts_at:"2026-11-01T10:00:00Z",provider_services:{title:"Avis partagé"}}]}));
 await page.route(`${api}/rest/v1/rpc/get_booking_reviews`,route=>route.fulfill({json:[]}));
 await page.route(`${api}/rest/v1/rpc/booking_review_submission_state`,route=>{expect(route.request().postDataJSON().target_type).toBe("provider_to_client");return route.fulfill({json:true});});
 await page.goto("/pro/reviews");await page.getByText(/Avis partagé.*Consulter les avis/).click();
 await expect(page.getByText("Une évaluation a déjà été enregistrée pour ce rendez-vous par votre équipe.",{exact:true})).toBeVisible();
 await expect(page.getByRole("radio")).toHaveCount(0);await expect(page.getByRole("button",{name:"Publier mon avis"})).toHaveCount(0);
});
