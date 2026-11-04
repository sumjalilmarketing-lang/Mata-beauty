import {expect,test} from '@playwright/test';
const api=process.env.MATA_SUPABASE_FIXTURE_ORIGIN;
test('phone invitation shows unavailable service honestly without requesting a code',async({page})=>{
 await page.route(`${api}/auth/v1/settings`,r=>r.fulfill({json:{external:{phone:false}}}));
 await page.goto('/salon/invitation/accept#token='+'r'.repeat(43));
 await expect(page.getByText('L’envoi des codes SMS n’est pas encore activé. La connexion par numéro sera disponible après configuration du service.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Recevoir mon code par SMS',exact:true})).toHaveCount(0);
});
test('phone code request requires consent and rejects an invalid OTP without joining',async({page})=>{
 await page.route(`${api}/auth/v1/settings`,r=>r.fulfill({json:{external:{phone:true}}}));let sent=0,joined=0;
 await page.route(`${api}/auth/v1/otp`,r=>{expect(r.request().postDataJSON().phone).toBe('+221770000099');sent++;return r.fulfill({json:{}});});
 await page.route(`${api}/auth/v1/verify`,r=>r.fulfill({status:403,json:{code:'otp_expired',msg:'Token has expired or is invalid'}}));
 await page.route('**/api/salon/invitations/accept',r=>{joined++;return r.fulfill({status:403,json:{}});});
 await page.goto('/salon/invitation/accept#token='+'s'.repeat(43));
 await page.getByLabel('Numéro de téléphone avec indicatif',{exact:true}).fill('+221 77 000 00 99');
 const send=page.getByRole('button',{name:'Recevoir mon code par SMS',exact:true});await expect(send).toBeDisabled();
 await page.getByRole('checkbox').check();await send.click();await page.getByLabel('Code reçu par SMS',{exact:true}).fill('123456');
 await page.getByRole('button',{name:'Vérifier et rejoindre le salon',exact:true}).click();
 await expect(page.getByText('Code invalide, expiré ou accès indisponible. Vérifiez le code reçu.',{exact:true})).toBeVisible();expect(sent).toBe(1);expect(joined).toBe(0);
});
