const http = require("node:http");

const HOST = "127.0.0.1";
const PORT = 3000;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`OpsLab API listening on http://${HOST}:${PORT}`);
});
