import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseFixtureServer } from './supabase-rest-fixture.mjs';
import { syntheticSession } from './department-workspaces.mjs';

// Run with node --test. This verifies the fixture's real PostgREST contract,
// independently of a browser and without contacting hosted Supabase.
const server = createSupabaseFixtureServer(0);
let client;
before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  client = createClient(`http://127.0.0.1:${server.address().port}`, 'synthetic-anon', {
    global: { headers: { Authorization: `Bearer ${syntheticSession('provider').access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});
for (const table of ['businesses', 'provider_profiles']) {
  test(`${table}: collections and singular queries keep PostgREST cardinality`, async () => {
    const collection = await client.from(table).select('*');
    assert.ifError(collection.error);
    assert.equal(collection.data.length, 1);
    const single = await client.from(table).select('*').single();
    assert.ifError(single.error);
    assert.deepEqual(single.data, collection.data[0]);
    const maybeSingle = await client.from(table).select('*').maybeSingle();
    assert.ifError(maybeSingle.error);
    assert.deepEqual(maybeSingle.data, collection.data[0]);
  });
}
