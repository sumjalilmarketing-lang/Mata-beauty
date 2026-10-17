import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import next from "next";
import { startSupabaseFixture } from "../tests/e2e/fixtures/supabase-rest-fixture.mjs";

const root = process.cwd();
const testPort = Number(process.env.MATA_PLAYWRIGHT_PORT ?? 3160);
const fixturePort = Number(process.env.MATA_SUPABASE_FIXTURE_PORT ?? 3161);
const testOrigin = `http://127.0.0.1:${testPort}`;
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const distDir = process.env.MATA_E2E_NEXT_DIST_DIR ?? ".next/playwright-stabilization-prod";
const e2eTsconfig = resolve(root, ".next/playwright-tsconfig.json");

Object.assign(process.env, {
  MATA_PLAYWRIGHT_PORT: String(testPort),
  MATA_SUPABASE_FIXTURE_PORT: String(fixturePort),
  MATA_SUPABASE_FIXTURE_ORIGIN: fixtureOrigin,
  MATA_E2E_NEXT_DIST_DIR: distDir,
  MATA_E2E_TSCONFIG: ".next/playwright-tsconfig.json",
  NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: randomUUID(),
  SUPABASE_SERVICE_ROLE_KEY: randomUUID(),
  NEXT_PUBLIC_SALON_COLLABORATOR_ACCESS_ENABLED: "false",
});

await mkdir(resolve(root, ".next"), { recursive: true });
await writeFile(e2eTsconfig, JSON.stringify({
  extends: "../tsconfig.json",
  compilerOptions: { baseUrl: "..", paths: { "@/*": ["./*"] } },
  include: ["../next-env.d.ts", "../**/*.ts", "../**/*.tsx", `./${distDir.replaceAll("\\", "/")}/types/**/*.ts`, `./${distDir.replaceAll("\\", "/")}/dev/types/**/*.ts`],
  exclude: ["../node_modules", "../dist", "../work", "../outputs"],
}, null, 2));

let fixture;
let nextApp;
let appServer;
let interrupted = false;
let testProcess;

function listen(server, port) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
}

async function waitForApp(server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.listening) {
      try {
        const response = await fetch(testOrigin, { signal: AbortSignal.timeout(2_000) });
        if (response.ok) return;
      } catch { /* Next is still compiling the first route. */ }
    }
    await delay(200);
  }
  throw new Error("Next.js local E2E server did not become ready within 120 seconds.");
}

async function closeServer(server) {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}

async function closeNext() {
  await closeServer(appServer);
  if (nextApp) await nextApp.close();
}

function runPlaywright(args) {
  const cliArgs = args[0] === "--" ? args.slice(1) : args;
  return new Promise((resolveExit, reject) => {
    testProcess = spawn(process.execPath, [resolve(root, "node_modules/@playwright/test/cli.js"), "test", ...cliArgs], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    testProcess.once("error", reject);
    testProcess.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
}

process.once("SIGINT", () => {
  interrupted = true;
  if (testProcess && process.platform === "win32") testProcess.kill("SIGINT");
});
process.once("SIGTERM", () => {
  interrupted = true;
  if (testProcess) testProcess.kill("SIGTERM");
});

let exitCode = 1;
try {
  fixture = await startSupabaseFixture(fixturePort);
  // Webpack avoids Turbopack's detached Rust worker on Windows, which can
  // outlive the server and race with the next build's .next cleanup.
  nextApp = next({ dev: true, webpack: true, dir: root, port: testPort, hostname: "127.0.0.1" });
  await nextApp.prepare();
  const handler = nextApp.getRequestHandler();
  appServer = createServer((request, response) => handler(request, response));
  await listen(appServer, testPort);
  await waitForApp(appServer);
  exitCode = await runPlaywright(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  try {
    await closeNext();
  } catch (error) {
    console.error("Next.js E2E server shutdown failed:", error instanceof Error ? error.message : error);
    exitCode ||= 1;
  }
  try {
    await closeServer(fixture);
  } catch (error) {
    console.error("Local Supabase fixture shutdown failed:", error instanceof Error ? error.message : error);
    exitCode ||= 1;
  }
  process.exitCode = interrupted ? 130 : exitCode;
  console.log("E2E_LOCAL_SERVERS_STOPPED");
  // Next dev's file watchers are still live after its documented close hook.
  // The HTTP listener and local fixture are already closed above, so exiting
  // this dedicated runner releases only its remaining in-process watchers.
  process.exit(process.exitCode);
}
