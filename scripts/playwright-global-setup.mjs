import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.MATA_PLAYWRIGHT_PORT ?? 4173);
const host = "127.0.0.1";
const baseUrl = `http://${host}:${port}`;
const nextCli = resolve(process.cwd(), "node_modules/next/dist/bin/next");

function isPortFree() {
  return new Promise((resolveResult, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolveResult(false);
      else reject(error);
    });
    server.listen(port, host, () => server.close(() => resolveResult(true)));
  });
}

function acceptsConnections() {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host, port });
    const finish = (connected) => {
      socket.destroy();
      resolveResult(connected);
    };
    socket.setTimeout(1500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolveResult) => child.once("exit", () => resolveResult(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 3000)) return;

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`Playwright n’a pas pu fermer son serveur local (PID ${child.pid}): ${result.stderr || result.stdout || result.error?.message || "erreur inconnue"}`);
    }
  } else {
    child.kill("SIGKILL");
  }
  if (!(await waitForExit(child, 5000))) {
    throw new Error(`Le serveur local Playwright (PID ${child.pid}) ne s’est pas arrêté.`);
  }
}

export default async function globalSetup() {
  // scripts/test-e2e.mjs owns a production-mode Next server on this port.
  // Do not start a second dev server over the managed server.
  if (process.env.MATA_E2E_MANAGED_SERVER === "true") return;

  if (!(await isPortFree())) {
    throw new Error(`Le port ${port} est déjà utilisé. Aucun serveur existant n’a été réutilisé ni arrêté.`);
  }

  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", host, "-p", String(port)], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_APP_URL: baseUrl,
      NEXT_PUBLIC_SUPABASE_URL: "https://audit.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "audit-public-anon-key",
      MESSAGING_V2_DEMO_ONLY: process.env.MESSAGING_V2_DEMO_ONLY ?? "false",
    },
  });

  child.once("error", (error) => {
    process.stderr.write(`Échec de démarrage du serveur E2E: ${error.message}\n`);
  });

  const deadline = Date.now() + 120_000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Le serveur E2E s’est arrêté prématurément (code ${child.exitCode}).`);
      if (await acceptsConnections()) break;
      await delay(500);
    }
    if (!(await acceptsConnections())) throw new Error(`Le serveur E2E n’a pas ouvert ${baseUrl} sous 120 secondes.`);
  } catch (error) {
    await stopServer(child).catch(() => undefined);
    throw error;
  }

  return async () => stopServer(child);
}
