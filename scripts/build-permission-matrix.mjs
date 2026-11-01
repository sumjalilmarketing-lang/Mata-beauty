import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Only whitelisted fields are exported: no fixtures, user IDs, credentials or traces.
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const roles = ['client', 'professional', 'verification_agent', 'support', 'finance', 'moderator', 'content_manager', 'admin', 'super_admin'];
const rows = [];
for (const role of roles) {
  const file = `work/permission-audit/modules-production-${role}.json`;
  const report = await read(file);
  assert.equal(report.results.length, 88);
  for (const r of report.results) rows.push({
    role, surface: r.path, action: 'READ', assurance: ['client', 'professional'].includes(role) ? 'aal1' : 'aal2',
    expected: r.expected, observed: r.observation, status: r.status,
    scope: r.expected === 'DENIED' ? 'SERVER_ROUTE_DENIAL' : 'SCREEN_LOAD_ONLY_BUSINESS_ACTIONS_UNQUALIFIED', evidence: file, date: report.date,
  });
}
for (const [file, scope] of [
  ['work/permission-audit/permission-gates-production.json', 'PERMISSION_GATE_NOT_BUSINESS_OPERATION'],
  ['work/permission-audit/role-crud-production.json', 'ACTUAL_API_OPERATION_AND_READBACK'],
]) {
  const report = await read(file);
  for (const r of report.results) rows.push({
    role: r.role, surface: r.api + (r.permission ? `:${r.permission}` : ''), action: r.action.toUpperCase(), assurance: r.assurance ?? (['client', 'professional'].includes(r.role) ? 'aal1' : 'aal2'),
    expected: String(r.expected), observed: r.observed === undefined ? 'See named test and assertions' : String(r.observed), status: r.status, scope, evidence: file, date: report.date,
  });
}
const fields = ['role', 'surface', 'action', 'assurance', 'expected', 'observed', 'status', 'scope', 'evidence', 'date'];
const csv = [fields, ...rows.map(row => fields.map(field => row[field] ?? ''))].map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
await writeFile('docs/MATA_BEAUTY_ROLE_MATRIX_2026-10-07.csv', csv + '\n');
const grouped = roles.map(role => ({ role, routes: rows.filter(r => r.role === role && r.scope.includes('ROUTE_DENIAL')).length, rendered: rows.filter(r => r.role === role && r.scope.startsWith('SCREEN')).length, gates: rows.filter(r => r.role === role && r.scope.startsWith('PERMISSION')).length, operations: rows.filter(r => r.role === role && r.scope.startsWith('ACTUAL')).length }));
const summary = { generatedAt: new Date().toISOString(), total: rows.length, counts: Object.fromEntries(['PASS', 'FAIL', 'NOT TESTED', 'BLOCKED'].map(status => [status, rows.filter(r => r.status === status).length])), grouped };
await writeFile('docs/MATA_BEAUTY_ROLE_MATRIX_2026-10-07.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
