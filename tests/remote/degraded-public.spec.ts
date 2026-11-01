import { expect, test } from '@playwright/test';

test.beforeEach(async ({page}) => {
  const bypass=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if(bypass) await page.setExtraHTTPHeaders({'x-vercel-protection-bypass':bypass,'x-vercel-set-bypass-cookie':'true'});
});

for (const mode of ['allowed','denied','unavailable','timeout','imprecise']) test(`GPS simulated ${mode} and manual fallback`,async ({page})=>{
  await page.addInitScript(mode=>{
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success:(position:unknown)=>void,error:(failure:unknown)=>void){
      if(mode==='timeout')return;
      if(mode==='denied'||mode==='unavailable'){error({code:mode==='denied'?1:2});return;}
      success({coords:{latitude:14.7167,longitude:-17.4677,accuracy:mode==='imprecise'?6000:30},timestamp:Date.now()});
    }}});
  },mode);
  await page.goto('/');
  await page.getByRole('button',{name:'Près de moi',exact:true}).click();
  const picker=page.getByRole('region',{name:'Choisir votre localisation'});
  await expect(picker).toBeVisible();
  const messages:Record<string,string>={allowed:'Résultats dans un rayon de 25 km',denied:'Localisation refusée.',unavailable:'Position indisponible.',timeout:'La localisation prend trop de temps.',imprecise:'Votre position est trop imprécise.'};
  await expect(picker.getByRole('status')).toContainText(messages[mode],{timeout:15000});
  await picker.getByLabel('Ville ou quartier').fill('Dakar');
  await expect(picker.getByLabel('Ville ou quartier')).toHaveValue('Dakar');
  await expect(picker.getByRole('button',{name:'Utiliser ma position',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Voir les résultats',exact:true}).click();
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Dakar · Modifier',exact:true})).toBeVisible();
});

test('feed API failure gives an error and retry recovers',async({page})=>{
  await page.route('**/rest/v1/social_feed?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"QA unavailable"}'}));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Le feed est indisponible'})).toBeVisible({timeout:25000});
  await page.unroute('**/rest/v1/social_feed?*');
  await page.getByRole('button',{name:'Réessayer',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Le feed est indisponible'})).toHaveCount(0,{timeout:25000});
  await expect(page.getByLabel('Chargement du feed')).toHaveCount(0,{timeout:25000});
});
