const http = require("node:http");
const { Pool } = require("pg");

const HOST = "127.0.0.1";
const PORT = 3000;

const pool = new Pool();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // HEALTH CHECK
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // READ - listar serviços
  if (req.method === "GET" && req.url === "/services") {
    try {
      const result = await pool.query(
        "SELECT id, name, status, created_at FROM public.services ORDER BY id;"
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows));
    } catch (error) {
      console.error("Database query failed:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "database_error" }));
    }

    return;
  }

  // CREATE - criar serviço
  if (req.method === "POST" && req.url === "/services") {
    try {
      const body = await readJsonBody(req);

      if (
        typeof body.name !== "string" ||
        body.name.trim() === "" ||
        typeof body.status !== "string" ||
        body.status.trim() === ""
      ) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_input" }));
        return;
      }

      const result = await pool.query(
        `INSERT INTO public.services (name, status)
         VALUES ($1, $2)
         RETURNING id, name, status, created_at;`,
        [body.name.trim(), body.status.trim()]
      );

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows[0]));
    } catch (error) {
      if (error.message === "invalid_json") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      console.error("Database insert failed:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "database_error" }));
    }

    return;
  }

  const serviceMatch = req.url.match(/^\/services\/(\d+)$/);

  // UPDATE - atualizar serviço
  if (req.method === "PUT" && serviceMatch) {
    try {
      const serviceId = serviceMatch[1];
      const body = await readJsonBody(req);

      if (
        typeof body.name !== "string" ||
        body.name.trim() === "" ||
        typeof body.status !== "string" ||
        body.status.trim() === ""
      ) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_input" }));
        return;
      }

      const result = await pool.query(
        `UPDATE public.services
         SET name = $1, status = $2
         WHERE id = $3
         RETURNING id, name, status, created_at;`,
        [body.name.trim(), body.status.trim(), serviceId]
      );

      if (result.rowCount === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "service_not_found" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows[0]));
    } catch (error) {
      if (error.message === "invalid_json") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      console.error("Database update failed:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "database_error" }));
    }

    return;
  }

  // DELETE - excluir serviço
  if (req.method === "DELETE" && serviceMatch) {
    try {
      const serviceId = serviceMatch[1];

      const result = await pool.query(
        `DELETE FROM public.services
         WHERE id = $1
         RETURNING id, name, status, created_at;`,
        [serviceId]
      );

      if (result.rowCount === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "service_not_found" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.rows[0]));
    } catch (error) {
      console.error("Database delete failed:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "database_error" }));
    }

    return;
  }

  // ROTA NÃO ENCONTRADA
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, HOST, () => {
  console.log(`OpsLab API listening on http://${HOST}:${PORT}`);
});
