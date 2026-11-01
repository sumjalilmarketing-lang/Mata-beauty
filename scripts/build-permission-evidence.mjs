import { readFile, writeFile } from 'node:fs/promises';
const files = [
  'work/team-audit/production-rpc-results.json',
  'work/team-audit/production-ui-results.json',
  'work/team-audit/production-ui-support-results.json',
  'work/team-audit/production-ui-verification_agent-results.json',
  'work/team-audit/production-ui-moderator-results.json',
  ...['legacy-mfa', 'social-integrity', 'profile-privacy', 'launch-boundaries', 'deletion-workflow', 'deletion-ui', 'catalog-actions', 'payout-register'].map(name => `work/permission-audit/${name}-production.json`),
  'work/permission-audit/verification-production-f212471.json',
  'work/permission-audit/module-actions-production-super_admin.json',
  'work/permission-audit/module-actions-production-moderator.json',
  'work/permission-audit/decision-actions-production-finance.json',
  'work/permission-audit/decision-actions-production-moderator.json',
  'work/permission-audit/refund-concurrency-qa.json',
  'work/permission-audit/maintenance-ui-qa.json',
  'work/final-audit/final-role-security.json',
  'work/final-audit/booking-concurrency.json',
];
const evidence = [];
for (const source of files) {
  const report = JSON.parse(await readFile(source, 'utf8'));
  const rows = Array.isArray(report) ? report : report.results ?? report.rows;
  if (!Array.isArray(rows)) throw new Error(`Unknown proof format: ${source}`);
  evidence.push({ source, date: report.date ?? null, checks: rows.map(row => ({ name: row.name ?? row.action, status: row.status, ...(row.role ? { role: row.role } : {}), ...(row.actor ? { actorRole: row.actor } : {}) })) });
}
// Deliberately exclude tokens, request headers, fixture IDs and arbitrary detail/body fields.
await writeFile('docs/MATA_BEAUTY_PERMISSION_EVIDENCE_2026-10-07.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence.map(item => ({ source: item.source, count: item.checks.length, failures: item.checks.filter(row => row.status !== 'PASS').length }))));
