import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, afterEach, expect, it } from 'vitest';

const authorA = '11111111-1111-4111-8111-111111111111';
const authorB = '22222222-2222-4222-8222-222222222222';
const postA = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const postB = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function public.has_admin_permission(text) returns boolean language sql stable as $$select false$$;
    create table public.posts(id uuid primary key,author_id uuid not null,status text,visibility text,video_url text,thumbnail_url text);
    create table public.social_post_media(id uuid primary key default gen_random_uuid(),post_id uuid references public.posts(id),bucket_id text,storage_path text,thumbnail_path text);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,owner uuid,unique(bucket_id,name));
    create function public.is_public_social_post(target uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.posts where id=target and status='published' and visibility='public')$$;
    alter table public.social_post_media enable row level security;
    create policy owner_manage on public.social_post_media for all using(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid())) with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
    alter table storage.objects enable row level security;
    -- Historical permissive policy: the new restrictive boundary must still hold.
    create policy historical_public_media on storage.objects for select using(bucket_id in ('provider-social-media','social-videos','social-thumbnails'));
    grant usage on schema auth,storage to anon,authenticated;
    grant select,insert,update on public.posts,public.social_post_media to authenticated;
    grant select on storage.objects to anon,authenticated;
  `);
  // Set by the versioned migration created with the Supabase CLI.
  await db.exec(await readFile(new URL('../../supabase/migrations/20261107001956_secure_media_object_ownership.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.posts(id,author_id,status,visibility) values($1,$2,'published','public'),($3,$4,'draft','public')`, [postA, authorA, postB, authorB]);
  for (const [bucket, path, owner] of [
    ['provider-social-media', `${authorA}/${postA}/video.mp4`, authorA],
    ['provider-social-media', `${authorA}/${postA}/thumbnail.jpg`, authorA],
    ['provider-social-media', `${authorB}/${postB}/thumbnail.jpg`, authorB],
    ['social-videos', `${authorA}/legacy.mp4`, null],
    ['social-thumbnails', `${authorA}/legacy.jpg`, null],
    ['provider-social-media', `${authorA}/spoofed-owner.jpg`, authorB],
  ]) await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)', [bucket, path, owner]);
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
async function actor(id: string | null) {
  await db.exec(`set local role ${id ? 'authenticated' : 'anon'}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id ?? '']);
}
async function denied(sql: string, values: unknown[]) {
  await db.exec('savepoint denied');
  try { await expect(db.query(sql, values)).rejects.toMatchObject({ code: '42501' }); }
  finally { await db.exec('rollback to savepoint denied; release savepoint denied'); }
}
async function attach(path = `${authorA}/${postA}/video.mp4`, thumbnail: string | null = `${authorA}/${postA}/thumbnail.jpg`, bucket = 'provider-social-media') {
  return db.query('insert into public.social_post_media(post_id,bucket_id,storage_path,thumbnail_path) values($1,$2,$3,$4) returning id', [postA, bucket, path, thumbnail]);
}
it('allows own published video and cover, while anonymous readers cannot read a known private object', async () => {
  await actor(authorA); await attach();
  await actor(null);
  expect((await db.query('select name from storage.objects order by name')).rows).toEqual([
    { name: `${authorA}/${postA}/thumbnail.jpg` }, { name: `${authorA}/${postA}/video.mp4` },
  ]);
});
it('blocks inserting another author’s known video or cover and modifying an existing cover', async () => {
  await actor(authorA);
  await denied('insert into public.social_post_media(post_id,bucket_id,storage_path) values($1,$2,$3)', [postA, 'provider-social-media', `${authorB}/${postB}/thumbnail.jpg`]);
  await denied('insert into public.social_post_media(post_id,bucket_id,storage_path,thumbnail_path) values($1,$2,$3,$4)', [postA, 'provider-social-media', `${authorA}/${postA}/video.mp4`, `${authorB}/${postB}/thumbnail.jpg`]);
  await attach();
  await denied('update public.social_post_media set thumbnail_path=$1 where post_id=$2', [`${authorB}/${postB}/thumbnail.jpg`, postA]);
});
it('does not trust an author-shaped prefix when Storage identifies a different owner', async () => {
  await actor(authorA);
  await denied('insert into public.social_post_media(post_id,bucket_id,storage_path) values($1,$2,$3)', [postA, 'provider-social-media', `${authorA}/spoofed-owner.jpg`]);
});
it('prevents moving media to another parent and changing a publication author', async () => {
  await actor(authorA); await attach();
  await denied('update public.social_post_media set post_id=$1 where post_id=$2', [postB, postA]);
  await denied('update public.posts set author_id=$1 where id=$2', [authorB, postA]);
});
it('preserves owned historical videos and thumbnails without owner metadata', async () => {
  await actor(authorA);
  await attach(`${authorA}/legacy.mp4`, null, 'social-videos');
  await attach(`${authorA}/legacy.jpg`, null, 'social-thumbnails');
  await actor(null);
  expect((await db.query('select name from storage.objects order by name')).rows).toEqual([
    { name: `${authorA}/legacy.jpg` }, { name: `${authorA}/legacy.mp4` },
  ]);
});
it('denies stale foreign references even if they existed before the trigger', async () => {
  // Simulate a historical poisoned row as the migration owner, not a user bypass.
  await db.exec('alter table public.social_post_media disable trigger social_media_owned_objects');
  await attach(`${authorB}/${postB}/thumbnail.jpg`, null);
  await db.exec('alter table public.social_post_media enable trigger social_media_owned_objects');
  await actor(null);
  expect((await db.query('select name from storage.objects')).rows).toEqual([]);
});

it('preserves public historical direct URLs without any media rows', async () => {
  await db.query('update public.posts set video_url=$1,thumbnail_url=$2 where id=$3', [
    `https://storage.example/storage/v1/object/public/social-videos/${authorA}/legacy.mp4`,
    `https://storage.example/storage/v1/object/public/social-thumbnails/${authorA}/legacy.jpg`, postA,
  ]);
  await actor(null);
  expect((await db.query('select name from storage.objects order by name')).rows).toEqual([
    { name: `${authorA}/legacy.jpg` }, { name: `${authorA}/legacy.mp4` },
  ]);
});
it('accepts valid historical URL-shaped media rows while keeping author ownership', async () => {
  await actor(authorA);
  await attach(`https://storage.example/storage/v1/object/public/social-videos/${authorA}/legacy.mp4`, `https://storage.example/storage/v1/object/public/social-thumbnails/${authorA}/legacy.jpg`, 'social-videos');
  await actor(null);
  expect((await db.query('select name from storage.objects')).rows).toHaveLength(2);
});
