import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as proxyRequest } from "node:http";
import { extname, normalize, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const clientRoot = resolve(root, "dist", "client");
const vinextCli = resolve(root, "node_modules", "vinext", "dist", "cli.js");
const upstreamPort = Number(process.env.UPSTREAM_PORT ?? 3001);
const publicPort = Number(process.env.PORT ?? 3000);
const mimeTypes = new Map([
  [".css", "text/css"],
  [".js", "application/javascript"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const child = spawn(process.execPath, [vinextCli, "start"], {
  cwd: root,
  env: { ...process.env, PORT: String(upstreamPort) },
  stdio: ["ignore", "inherit", "inherit"],
});

const server = createServer((incoming, outgoing) => {
  const pathname = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`).pathname;
  if (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/brand/") ||
    ["/og.png", "/favicon.svg", "/sw.js"].includes(pathname)
  ) {
    const candidate = resolve(clientRoot, normalize(pathname).replace(/^[/\\]+/, ""));
    if (candidate.startsWith(clientRoot) && existsSync(candidate) && statSync(candidate).isFile()) {
      outgoing.writeHead(200, {
        "Content-Type": mimeTypes.get(extname(candidate)) ?? "application/octet-stream",
        "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      });
      createReadStream(candidate).pipe(outgoing);
      return;
    }
  }

  const proxy = proxyRequest({
    hostname: "127.0.0.1",
    port: upstreamPort,
    path: incoming.url,
    method: incoming.method,
    headers: incoming.headers,
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  proxy.on("error", () => {
    if (!outgoing.headersSent) outgoing.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    outgoing.end("Le serveur de prévisualisation démarre. Réessayez.");
  });
  incoming.pipe(proxy);
});

server.listen(publicPort, "127.0.0.1");

function shutdown() {
  server.close();
  child.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
