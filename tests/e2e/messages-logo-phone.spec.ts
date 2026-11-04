import { expect, test, type BrowserContext } from '@playwright/test';
import { syntheticId, syntheticSession } from './fixtures/department-workspaces.mjs';
import { auditBusiness } from './fixtures/provider-audit.mjs';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
async function login(context: BrowserContext, role: string) {
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(syntheticSession(role))).toString('base64url'), domain: '127.0.0.1', path: '/', httpOnly: false, sameSite: 'Lax' }]);
}

test('client opens the booked professional and sends the first message', async ({ page, context }) => {
  await login(context, 'client');
  const booking = syntheticId(505), provider = syntheticId(9), conversation = syntheticId(901);
  const actor = syntheticSession('client').user.id;
  const starts = new Date(Date.now() + 86400000).toISOString();
  await page.route(`${api}/rest/v1/bookings**`, route => route.fulfill({ json: [{ id: booking, client_id: actor, provider_id: provider, starts_at: starts, status: 'pending', provider_services: { title: 'Tresses de recette' } }] }));
  await page.route('**/api/bookings/conversation-context?**', route => {
    const row = { bookingId: booking, participantId: provider, name: 'Professionnel réservé', avatarUrl: null, startsAt: starts, status: 'pending' };
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has('bookings') ? { bookings: [row] } : row });
  });
  await page.route(`${api}/rest/v1/rpc/ensure_booking_conversation`, route => { expect(route.request().postDataJSON().target_booking_id).toBe(booking); return route.fulfill({ json: conversation }); });
  const messages: { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }[] = [];
  await page.route(`${api}/rest/v1/messages**`, route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); expect(body.conversation_id).toBe(conversation);
      const message = { ...body, id: syntheticId(902), created_at: new Date().toISOString() }; messages.push(message);
      return route.fulfill({ json: message });
    }
    return route.fulfill({ json: messages });
  });
  await page.goto('/app/messages?booking=' + booking);
  await expect(page.locator('.messaging-thread-area')).toContainText('Professionnel réservé');
  await expect(page.locator('#booking-message')).toBeEnabled();
  await page.locator('#booking-message').fill('Bonjour, je confirme les détails de ma réservation.');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.getByText('Bonjour, je confirme les détails de ma réservation.', { exact: true })).toBeVisible();
  expect(messages).toHaveLength(1);
});

test('salon invites by phone and prepares a WhatsApp draft without requiring email', async ({ page, context }) => {
  test.skip(process.env.MATA_E2E_COLLABORATOR_ACCESS_ENABLED !== 'true', 'Collaborator-enabled build required');
  await login(context, 'provider');
  let created = false, approved = false;
  const token = 'p'.repeat(43), claimId = syntheticId(911);
  await page.route('**/api/salon/team?**', route => route.fulfill({ json: { access: [], audit: [], invitations: created ? [{ id: syntheticId(910), email: null, phone: '+221770000099', internal_role: 'member', status: 'pending', expires_at: new Date(Date.now()+86400000).toISOString(), created_at: new Date().toISOString(), claims: approved ? [] : [{ id: claimId, display_name: 'Équipier de recette', email: 'equipier@example.test', status: 'pending' }] }] : [] } }));
  await page.route('**/api/salon/team', route => {
    const body = route.request().postDataJSON();
    if (body.action === 'review_phone') { expect(body.claimId).toBe(claimId); expect(body.approve).toBe(true); approved=true; return route.fulfill({ json: { ok:true } }); }
    expect(body.action).toBe('invite_phone'); expect(body.phone).toBe('+221770000099'); expect(body).not.toHaveProperty('email');
    created=true; return route.fulfill({ status:201,json:{ok:true,invitationId:syntheticId(910),inviteUrl:new URL('/salon/invitation/accept#token='+token,page.url()).toString()} });
  });
  await page.goto('/salon/team');
  await expect(page.getByLabel('E-mail',{exact:true})).toHaveCount(0);
  await page.getByLabel('Numéro WhatsApp avec indicatif',{exact:true}).fill('+221 77 000 00 99');
  await page.getByRole('button',{name:'Créer l’invitation WhatsApp',exact:true}).click();
  const share=page.getByRole('link',{name:'Partager sur WhatsApp',exact:true});
  await expect(share).toBeVisible();
  const href=new URL((await share.getAttribute('href'))!);expect(href.pathname).toBe('/221770000099');expect(href.searchParams.get('text')).toContain('#token='+token);
  await page.getByRole('button',{name:'Confirmer l’accès de Équipier de recette',exact:true}).click();
  await expect(page.getByText('Accès de l’équipier confirmé.',{exact:true})).toBeVisible();expect(approved).toBe(true);
});

test('WhatsApp recipient waits for owner confirmation instead of receiving immediate staff access',async({page,context})=>{
  test.skip(process.env.MATA_E2E_COLLABORATOR_ACCESS_ENABLED !== 'true', 'Collaborator-enabled build required');
  await login(context,'client');
  await page.route('**/api/salon/invitations/accept',route=>route.fulfill({json:{ok:true,state:'pending_approval'}}));
  await page.goto('/salon/invitation/accept#token='+'q'.repeat(43));
  await page.getByRole('button',{name:'Oui, rejoindre l’équipe',exact:true}).click();
  await expect(page.getByText('Votre demande a été transmise au responsable du salon. Votre accès sera activé après sa confirmation.',{exact:true})).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/salon/invitation/accept');
});

test('uploaded salon logo is propagated through the controlled branding operation',async({page,context})=>{
  await login(context,'provider');let branded=false;
  await page.route(`${api}/storage/v1/object/business-media/**`,route=>route.fulfill({json:{Key:'fixture-logo',Id:syntheticId(920)}}));
  await page.route(`${api}/rest/v1/business_media**`,route=>route.fulfill({json:route.request().method()==='POST'?null:[]}));
  await page.route(`${api}/rest/v1/rpc/set_salon_brand_image`,route=>{const body=route.request().postDataJSON();expect(body.target_business_id).toBe(auditBusiness);expect(body.target_kind).toBe('logo');expect(body.target_url).toContain('/business-media/'+auditBusiness+'/logo-');branded=true;return route.fulfill({json:auditBusiness});});
  await page.goto('/salon/portfolio');
  await page.getByLabel('Image',{exact:true}).setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('synthetic image payload for UI test')});
  await page.getByRole('button',{name:'Envoyer l’image',exact:true}).click();
  await expect(page.getByText('Média du salon mis à jour.',{exact:true})).toBeVisible();expect(branded).toBe(true);
});


test('professional public profile displays its uploaded business logo',async({page})=>{
 await page.goto('/professional/mata-audit-tresses');
 const image=page.getByRole('img',{name:'Photo de Mata Audit Tresses',exact:true});
 await expect(image).toBeVisible();await expect(image).toHaveAttribute('src',/\/brand\/icon-512\.png$/);
});
