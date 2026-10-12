import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const port = Number(process.env.PORT || 8791);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const headerRules = [];
let selector = "";
for (const line of (await readFile(join(root, "_headers"), "utf8")).split(/\r?\n/)) {
  if (!line.trim()) continue;
  if (!/^\s/.test(line)) {
    selector = line.trim();
    headerRules.push({ selector, headers: {} });
  } else {
    const [key, ...value] = line.trim().split(":");
    headerRules.at(-1)?.headers &&
      (headerRules.at(-1).headers[key.trim()] = value.join(":").trim());
  }
}

function headersFor(pathname) {
  return Object.assign({}, ...headerRules
    .filter(({ selector }) => selector === "/*" ||
      (selector === "/assets/*" && pathname.startsWith("/assets/")) ||
      (selector === "/*.html" && pathname.endsWith(".html")))
    .map(({ headers }) => headers));
}

createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  let file = resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    await stat(file);
  } catch {
    file = join(root, "404.html");
    response.statusCode = 404;
  }
  response.setHeader("Content-Type", contentTypes[extname(file)] || "application/octet-stream");
  for (const [name, value] of Object.entries(headersFor(pathname))) response.setHeader(name, value);
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview at http://127.0.0.1:${port}/`);
  console.log("Headers loaded from public/_headers; local data only.");
});
