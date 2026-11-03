import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

async function migration() {
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const name = (await readdir(directory)).find((file) => file.endsWith('_delegated_visibility_compatibility.sql'));
  if (!name) throw new Error('Compatibility migration missing');
  return readFile(new URL(name, directory), 'utf8');
}

it('adds the missing visibility dependency without granting anonymous execution or changing existing policies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.profiles(id uuid primary key,is_suspended boolean);
      create table public.provider_profiles(profile_id uuid,status text);
      create table public.posts(id uuid primary key,author_id uuid,status text,visibility text,published_at timestamptz,reported boolean default false);
      create table public.post_services(post_id uuid,provider_service_id uuid,is_primary boolean);
      create table public.provider_services(id uuid,is_active boolean);
      create function public.social_post_not_strongly_reported(target uuid)returns boolean language sql stable as $$select not reported from public.posts where id=target$$;
      insert into profiles values('11111111-1111-4111-8111-111111111111',false);
      insert into provider_profiles values('11111111-1111-4111-8111-111111111111','approved');
      insert into provider_services values('22222222-2222-4222-8222-222222222222',true);
      insert into posts(id,author_id,status,visibility,published_at)values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','published','public',now()-interval '1 minute');
      insert into post_services values('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true);`);
    await db.exec(await migration());
    const visible = async () => (await db.query<{ ok: boolean }>("select public.is_public_social_post('33333333-3333-4333-8333-333333333333')ok")).rows[0].ok;
    expect(await visible()).toBe(true);
    for (const sql of ["update posts set status='draft'", "update posts set visibility='private'", "update profiles set is_suspended=true", "update provider_profiles set status='draft'", "update provider_services set is_active=false", "update post_services set is_primary=false", "update posts set published_at=now()+interval '1 day'", "update posts set reported=true"]) {
      await db.exec('begin'); await db.exec(sql); expect(await visible()).toBe(false); await db.exec('rollback');
    }
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon','public.is_public_social_post(uuid)','execute')ok")).rows[0].ok).toBe(false);
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('authenticated','public.is_public_social_post(uuid)','execute')ok")).rows[0].ok).toBe(true);
    expect((await db.query('select * from pg_policies')).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 60000);

it('preserves a visibility helper already present on Test and on fresh installations', async () => {
  const db = new PGlite();
  try {
    await db.exec('create function public.is_public_social_post(uuid)returns boolean language sql as $$select false$$;');
    const before = await db.query("select pg_get_functiondef('public.is_public_social_post(uuid)'::regprocedure)definition");
    await db.exec(await migration());
    expect((await db.query("select pg_get_functiondef('public.is_public_social_post(uuid)'::regprocedure)definition")).rows).toEqual(before.rows);
  } finally { await db.close(); }
}, 60000);
