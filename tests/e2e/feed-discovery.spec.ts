import { expect, test } from '@playwright/test';
import { bookingVideo } from './fixtures/booking-video';
import { syntheticSession } from './fixtures/department-workspaces.mjs';
const api = process.env.MATA_SUPABASE_FIXTURE_ORIGIN;

test('a public video with no public service stays visible without booking actions', async ({ page }) => {
  const id = '10000000-0000-4000-8000-000000000099';
  let availabilityRequests = 0;
  const post = { id, author_id: '20000000-0000-4000-8000-000000000099', post_type: 'video', caption: 'Vidéo publiée sans prestation réservable', business_name: 'Créateur public', city: 'Dakar', published_at: new Date().toISOString(), video_url: '/synthetic-discovery.mp4', thumbnail_url: null, duration_seconds: 20, view_count: 0, like_count: 0, comment_count: 0, save_count: 0, share_count: 0, provider_service_id: null, service_title: null, duration_minutes: null, price_amount: null, currency: null, hashtags: [] };
  await page.route(`${api}/rest/v1/social_feed**`, route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('select') === 'id' ? [{ id }] : [post] }));
  await page.route(`${api}/rest/v1/rpc/get_available_slots**`, route => { availabilityRequests++; return route.fulfill({ json: [] }); });
  await page.route('**/api/public/social-posts/*/media', route => route.fulfill({ json: { videoUrl: 'https://audit.supabase.co/storage/discovery.mp4', thumbnailUrl: null } }));
  await page.route('https://audit.supabase.co/storage/**', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: bookingVideo }));
  await page.goto('/');
  const card = page.locator('.social-video-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-post-id', id);
  await expect(card.locator('video')).toHaveAttribute('src', /discovery\.mp4/);
  await expect(card.getByRole('button', { name: 'Réserver', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Voir les disponibilités', exact: true })).toHaveCount(0);
  expect(availabilityRequests).toBe(0);
});

test('Pour toi discovers unknown creators, uses interests, and keeps the active clip stable', async ({page, context}) => {
  const session = syntheticSession('client');
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
  const base = {caption:'Découverte publique',video_url:'/synthetic-discovery.mp4',thumbnail_url:null,duration_seconds:20,view_count:200,like_count:0,comment_count:0,save_count:0,share_count:0,business_name:'Créateur inconnu',slug:'inconnu',city:'Dakar',verified_at:null,avatar_url:null,cover_url:null,is_sponsored:false,provider_service_id:null,service_title:'Tresses',duration_minutes:30,price_amount:10000,currency:'XOF',average_rating:0,review_count:0,hashtags:[],post_type:'video'};
  const posts = Array.from({length:10},(_,i)=>({...base,id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,author_id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,published_at:new Date(Date.now()-i*1000).toISOString(),service_title:i===7?'Spa et massage':'Tresses',caption:`Publication ${i+1}`}));
  await page.route(`${api}/rest/v1/social_feed**`,route=>{const url=new URL(route.request().url());if(url.searchParams.get('select')==='id')return route.fulfill({json:[{id:url.searchParams.get('id')?.replace('eq.','')}]});return route.fulfill({json:url.searchParams.has('or')?posts.slice(8):posts.slice(0,8)});});
  await page.route(`${api}/rest/v1/bookings**`,route=>route.fulfill({json:[{provider_services:{title:'Spa et massage'}}]}));
  await page.route(`${api}/rest/v1/post_likes**`,route=>{expect(new URL(route.request().url()).searchParams.get('profile_id')).toBe(`eq.${session.user.id}`);return route.fulfill({json:[]});});
  await page.route(`${api}/rest/v1/post_saves**`,route=>route.fulfill({json:[]}));
  await page.route(`${api}/rest/v1/favorites**`,route=>route.fulfill({json:[]}));
  await page.route(`${api}/rest/v1/follows**`,route=>{expect(new URL(route.request().url()).searchParams.get('follower_id')).toBe(`eq.${session.user.id}`);return route.fulfill({json:[{followed_provider_id:posts[9].author_id}]});});
  await page.route(`${api}/rest/v1/rpc/toggle_post_like**`,route=>route.fulfill({json:{active:true,count:1}}));
  await page.route('**/api/public/social-posts/*/media',route=>route.fulfill({json:{videoUrl:'https://audit.supabase.co/storage/discovery.mp4',thumbnailUrl:null}}));
  await page.route('https://audit.supabase.co/storage/**',route=>route.fulfill({status:200,contentType:'video/mp4',body:bookingVideo}));
  await page.goto('/');
  const cards=page.locator('.social-video-card');
  await expect(cards).toHaveCount(8);
  await expect(cards.first()).toHaveAttribute('data-post-id',posts[7].id);
  await expect(page.getByRole('button',{name:'Booster',exact:true})).toHaveCount(0);
  const firstId=await cards.first().getAttribute('data-post-id');
  await cards.first().getByRole('button',{name:'J’aime',exact:true}).click();
  await expect(cards.first().getByRole('button',{name:'J’aime',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(cards.first()).toHaveAttribute('data-post-id',firstId!);
  // Appending older candidates must preserve the already displayed prefix.
  await page.locator('.social-feed').evaluate(node=>node.scrollTo({top:node.clientHeight*7,behavior:'auto'}));
  await expect(cards).toHaveCount(10);
  await expect(cards.first()).toHaveAttribute('data-post-id',firstId!);
  await page.getByRole('navigation',{name:'Choix du fil'}).getByRole('button',{name:'Abonnements',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-post-id',posts[9].id);
  await page.getByRole('navigation',{name:'Choix du fil'}).getByRole('button',{name:'Pour toi',exact:true}).click();
  await expect(cards).toHaveCount(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('Following requires sign in while public discovery remains accessible',async({page})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Choix du fil'}).getByRole('button',{name:'Abonnements',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Se connecter',exact:true})).toBeVisible();
});

test('Following distinguishes a network failure from an empty following list', async({page,context})=>{
 const session=syntheticSession('client');
 await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
 let failed=true;
 await page.route(`${api}/rest/v1/follows**`,route=>route.fulfill(failed?{status:503,json:{message:'Synthetic outage'}}:{json:[]}));
 await page.route(`${api}/rest/v1/social_feed**`,route=>route.fulfill({json:[{id:'30000000-0000-4000-8000-000000000001',author_id:'40000000-0000-4000-8000-000000000001',post_type:'photo',caption:'Publication publique',video_url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',duration_seconds:0,view_count:0,like_count:0,comment_count:0,save_count:0,share_count:0,published_at:new Date().toISOString(),business_name:'Créateur',city:'Dakar',hashtags:[]}]}));
 await page.goto('/');
 await expect(page.locator('.social-video-card')).toHaveCount(1,{timeout:15000});
 await page.getByRole('navigation',{name:'Choix du fil'}).getByRole('button',{name:'Abonnements',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Vos abonnements n’ont pas pu être chargés.'})).toBeVisible({timeout:15000});
 await expect(page.getByRole('heading',{name:'Aucune vidéo de vos abonnements pour le moment.'})).toHaveCount(0);
 failed=false;
 await page.getByRole('button',{name:'Réessayer',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Aucune vidéo de vos abonnements pour le moment.'})).toBeVisible({timeout:15000});
});
