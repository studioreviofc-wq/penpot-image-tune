// Servidor estático local com CORS liberado para o Penpot carregar o plugin.
// Uso: node server.js  ->  instale no Penpot: http://localhost:4408/manifest.json
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4408;
const ROOT = path.join(__dirname, "docs");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  // /hub/ = páginas de teste locais (não publicadas)
  const base = urlPath.startsWith("/hub/") ? __dirname : ROOT;
  const file = path.normalize(path.join(base, urlPath));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Image Tune: http://localhost:${PORT}/manifest.json`));
