import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, posix, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot    = resolve(siteRoot, "src");
const publicRoot = resolve(siteRoot, "public");
const distRoot   = resolve(siteRoot, "dist");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function safeResolve(base, urlPath) {
  // Use posix to normalise the URL path, then join to the base.
  const clean = posix.normalize(urlPath).replace(/^\/+/, "");
  const full  = resolve(base, clean);
  return full.startsWith(base) ? full : null;
}

async function tryRead(base, urlPath) {
  const full = safeResolve(base, urlPath);
  if (!full) return null;
  try { return await readFile(full); } catch { return null; }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    const urlPath = url.pathname === "/" ? "/index.html" : url.pathname;

    // Try src/, then public/, then dist/ in order.
    let body = await tryRead(srcRoot, urlPath);
    let ext  = extname(urlPath);

    if (body === null) body = await tryRead(publicRoot, urlPath);
    if (body === null) body = await tryRead(distRoot,   urlPath);

    if (body === null) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Server error");
  }
}).listen(port, () => {
  console.log(`Engram site running at http://localhost:${port}`);
});
