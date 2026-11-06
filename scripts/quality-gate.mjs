import { spawnSync } from 'node:child_process';
const commands = [
  ['node', ['scripts/quality-hygiene.mjs', '--all']],
  ['node', ['--test', 'tests/quality-hygiene.test.mjs']],
  ['pnpm', ['lint']], ['pnpm', ['typecheck']],
  ['pnpm', ['test', '--maxWorkers=2']], ['pnpm', ['build']],
];
for (const [command, args] of commands) {
  console.log(`Quality: ${command} ${args.join(' ')}`);
  const windowsPnpm = process.platform === 'win32' && command === 'pnpm';
  // cmd is needed for Windows .cmd shims; all arguments above are fixed here.
  const result = spawnSync(windowsPnpm ? 'cmd.exe' : command, windowsPnpm ? ['/d', '/s', '/c', 'pnpm', ...args] : args, { stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? 'Quality gate failed.');
    process.exit(result.status || 1);
  }
}
