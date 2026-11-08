import { expect, test } from "@playwright/test";
import { bookingVideo } from "./fixtures/booking-video";
import { auditService } from "./fixtures/provider-audit.mjs";
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
  return route.fulfill({json:matches.slice(offset,offset+limit),headers:{"Access-Control-Expose-Headers":"content-range","content-range":`${offset}-${Math.min(offset+limit,matches.length)-1}/${matches.length}`}});
 });
 await page.goto("/support-agent/tickets");
 await expect(page.getByRole("button",{name:"Demande 001",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Demandes suivantes"}).click();
 await expect(page.getByRole("button",{name:"Demande 051",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Demandes suivantes"}).click();
 await expect(page.getByRole("button",{name:"Demande 101",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Demandes suivantes"})).toBeDisabled();
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
 for(let i=0;i<5;i++){await page.keyboard.press("Shift+Tab");expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
 await dialog.getByLabel("Motif obligatoire").fill("Motif de test");
 await expect(dialog.getByRole("button",{name:"Confirmer",exact:true})).toBeEnabled();
 for(const key of ["Tab","Shift+Tab"]) for(let i=0;i<5;i++){await page.keyboard.press(key);expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
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

test('a public video without a public service opens the profile and service selection', async ({ page }) => {
  const id = '10000000-0000-4000-8000-000000000099';
  let availabilityRequests = 0;
  const post = { id, author_id: '20000000-0000-4000-8000-000000000099', post_type: 'video', caption: 'Vidéo publiée sans prestation réservable', business_name: 'Créateur public', slug: 'createur-public', city: 'Dakar', published_at: new Date().toISOString(), video_url: '/synthetic-discovery.mp4', thumbnail_url: null, duration_seconds: 20, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, provider_service_id: null, service_title: null, duration_minutes: null, price_amount: null, currency: null, hashtags: [] };
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('select') === 'id' ? [{ id }] : [post] }));
  await page.route(`${api}/rest/v1/rpc/get_available_slots**`, route => { availabilityRequests++; return route.fulfill({ json: [] }); });
  await page.route('**/api/public/social-posts/*/media', route => route.fulfill({ json: { videoUrl: 'https://audit.supabase.co/storage/discovery.mp4', thumbnailUrl: null } }));
  await page.route('https://audit.supabase.co/storage/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: bookingVideo }));
  await page.goto('/');
  const card = page.locator('.social-video-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-post-id', id);
  await expect(card.locator('video')).toHaveAttribute('src', /discovery\.mp4/);
  await expect(card.getByRole('button', { name: 'Réserver', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Voir les disponibilités', exact: true })).toHaveCount(0);
  expect(availabilityRequests).toBe(0);
  await page.route('**/professional/createur-public**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Profil public</h1><section id="prestations">Prestations publiques</section>' }));
  await card.getByRole('button', { name: 'Réserver', exact: true }).click();
  await expect(page).toHaveURL(/\/professional\/createur-public#prestations$/);
});

test('feed profile share, likes and comments work without a booking catalogue entry', async ({ page, context }) => {
  const session = await qaLogin(context, 'client');
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { sessionStorage.setItem('shared-url', data.url ?? ''); } }));
  const id = '10000000-0000-4000-8000-000000000098';
  const post = { id, author_id: '20000000-0000-4000-8000-000000000098', slug: 'coiffeuse-publique', post_type: 'video', caption: 'Vidéo publique', business_name: 'Coiffeuse publique', city: 'Dakar', published_at: new Date().toISOString(), video_url: '/video.mp4', thumbnail_url: null, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, provider_service_id: null, service_title: null, duration_minutes: null, price_amount: null, currency: null, hashtags: [] };
  await page.route(`${api}/rest/v1/provider_profiles**`, route => route.fulfill({ json: [] }));
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('select') === 'id' ? [{ id }] : [post] }));
  await page.route('**/api/public/social-posts/*/media', route => route.fulfill({ json: { videoUrl: 'https://audit.supabase.co/storage/actions.mp4', thumbnailUrl: null } }));
  await page.route('https://audit.supabase.co/storage/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: bookingVideo }));
  let liked = false;
  await page.route(`${api}/rest/v1/rpc/toggle_post_like`, route => { expect(route.request().postDataJSON().target_post_id).toBe(id); liked = !liked; return route.fulfill({ json: { active: liked, count: liked ? 1 : 0 } }); });
  let failed = true;
  const comments: Array<{ id: string; author_id: string; body: string; parent_id: null; created_at: string; profiles: null }> = [];
  await page.route(`${api}/rest/v1/post_comments**`, async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.post_id).toBe(id); expect(body.author_id).toBe(session.user.id);
      if (failed) return route.fulfill({ status: 503, json: { message: 'Synthetic outage' } });
      comments.push({ id: 'comment', author_id: session.user.id, body: body.body, parent_id: null, created_at: new Date().toISOString(), profiles: null });
      return route.fulfill({ status: 201, json: null });
    }
    return route.fulfill({ json: comments });
  });
  await page.goto('/');
  const card = page.locator('.social-video-card');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'J’aime', exact: true }).click();
  await expect(card.getByRole('button', { name: 'J’aime', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'J’aime', exact: true }).click();
  await expect(card.getByRole('button', { name: 'J’aime', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await card.getByRole('button', { name: 'Partager', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('shared-url'))).toContain('/posts/' + id);
  await card.getByLabel('Plus d’options', { exact: true }).click();
  await card.getByRole('button', { name: 'Partager le profil', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('shared-url'))).toMatch(/\/professional\/coiffeuse-publique$/);
  await card.getByLabel('Plus d’options', { exact: true }).click();
  await card.getByRole('button', { name: 'Commentaires', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Commentaires', exact: true });
  await dialog.getByLabel('Ajouter un commentaire', { exact: true }).fill('Belle réalisation');
  await dialog.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.locator('.feed-feedback')).toContainText('Commentaire non publié');
  await expect(dialog.getByLabel('Ajouter un commentaire', { exact: true })).toHaveValue('Belle réalisation');
  failed = false;
  await dialog.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(dialog.getByText('Belle réalisation', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Ajouter un commentaire', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.route('**/professional/coiffeuse-publique', route => route.fulfill({ contentType: 'text/html', body: '<h1>Profil du professionnel</h1>' }));
  await card.getByRole('button', { name: 'Profil de Coiffeuse publique', exact: true }).click();
  await expect(page).toHaveURL(/\/professional\/coiffeuse-publique$/);
});

test('Studio publishes a linked draft service only after the owner requests it', async ({ page, context }) => {
  await qaLogin(context, 'provider');
  let published = false;
  let calls = 0;
  const service = () => ({ id: auditService, title: 'Prestation du Studio', duration_minutes: 60, price_amount: 10000, currency: 'XOF', services: null, status: published ? 'published' : 'draft', is_active: published, archived_at: null });
  await page.route(`${api}/rest/v1/posts**`, route => route.fulfill({ json: [{ id: '10000000-0000-4000-8000-000000000097', post_type: 'video', title: 'Vidéo existante', caption: '', status: 'published', thumbnail_url: null, view_count: 0, like_count: 0, comment_count: 0, created_at: new Date().toISOString(), published_at: new Date().toISOString(), post_services: [{ is_primary: true, provider_services: service() }] }] }));
  await page.route(`${api}/rest/v1/provider_services**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? service() : [service()] }));
  await page.route(`${api}/rest/v1/rpc/set_owned_service_status`, route => { calls++; expect(route.request().postDataJSON()).toEqual({ target_service_id: auditService, next_status: 'published' }); published = true; return route.fulfill({ json: null }); });
  await page.goto('/pro/videos');
  await page.getByRole('button', { name: 'Mes vidéos', exact: true }).click();
  const action = page.getByRole('button', { name: 'Publier la prestation pour permettre la réservation', exact: true });
  await expect(action).toBeVisible();
  expect(calls).toBe(0);
  await action.click();
  await expect(page.getByRole('status').filter({ hasText: 'Prestation publiée.' })).toBeVisible();
  await expect(action).toHaveCount(0);
  expect(calls).toBe(1);
});
