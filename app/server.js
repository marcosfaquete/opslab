const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const { Pool } = require("pg");

const HOST = "127.0.0.1";
const PORT = parsePort(process.env.PORT || "3000");
const PUBLIC_WRITES_ENABLED = false;
const BYTES_PER_MEGABYTE = 1024 * 1024;
const DEFAULT_HISTORY_HOURS = 24;
const MAX_HISTORY_POINTS = 2016;
const ALLOWED_HISTORY_HOURS = new Set([1, 6, 24, 168]);

const pool = new Pool();

const HISTORY_SELECT_SQL = [
  "SELECT",
  '  collected_at AS "collectedAt",',
  '  api_reachable AS "apiReachable",',
  '  system_uptime_seconds AS "systemUptimeSeconds",',
  '  memory_total_mb AS "memoryTotalMb",',
  '  memory_available_mb AS "memoryAvailableMb",',
  '  memory_used_mb AS "memoryUsedMb",',
  '  memory_used_percent AS "memoryUsedPercent",',
  '  load_one AS "loadOne",',
  '  load_five AS "loadFive",',
  '  load_fifteen AS "loadFifteen",',
  '  process_uptime_seconds AS "processUptimeSeconds",',
  '  process_rss_mb AS "processRssMb",',
  '  process_heap_used_mb AS "processHeapUsedMb",',
  '  process_heap_total_mb AS "processHeapTotalMb"',
  "FROM (",
  "  SELECT",
  "    collected_at, api_reachable, system_uptime_seconds,",
  "    memory_total_mb, memory_available_mb, memory_used_mb,",
  "    memory_used_percent, load_one, load_five, load_fifteen,",
  "    process_uptime_seconds, process_rss_mb,",
  "    process_heap_used_mb, process_heap_total_mb",
  "  FROM public.monitoring_snapshots",
  "  WHERE collected_at >= now() - ($1::integer * interval '1 hour')",
  "  ORDER BY collected_at DESC",
  "  LIMIT $2",
  ") AS recent",
  "ORDER BY collected_at ASC;"
].join("\n");

function parsePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("invalid_port");
  }

  return port;
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function bytesToMegabytes(bytes) {
  return round(bytes / BYTES_PER_MEGABYTE);
}

function sendJson(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...headers
  });
  res.end(JSON.stringify(body));
}

async function readOperatingSystemName() {
  try {
    const release = await fs.readFile("/etc/os-release", "utf8");
    const prettyNameLine = release
      .split("\n")
      .find((line) => line.startsWith("PRETTY_NAME="));

    if (!prettyNameLine) {
      return os.type();
    }

    const value = prettyNameLine.slice("PRETTY_NAME=".length).trim();
    const hasMatchingQuotes =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    return hasMatchingQuotes ? value.slice(1, -1) : value;
  } catch {
    return os.type();
  }
}

async function readMemoryBytes() {
  try {
    const meminfo = await fs.readFile("/proc/meminfo", "utf8");
    const values = new Map();

    for (const line of meminfo.split("\n")) {
      const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);

      if (match) {
        values.set(match[1], Number(match[2]) * 1024);
      }
    }

    const totalBytes = values.get("MemTotal");
    const availableBytes = values.get("MemAvailable");

    if (Number.isFinite(totalBytes) && Number.isFinite(availableBytes)) {
      return { totalBytes, availableBytes };
    }
  } catch {
    // Fall through to the portable Node.js values below.
  }

  return {
    totalBytes: os.totalmem(),
    availableBytes: os.freemem()
  };
}

async function getSystemSnapshot() {
  const [operatingSystem, memoryBytes] = await Promise.all([
    readOperatingSystemName(),
    readMemoryBytes()
  ]);
  const totalBytes = Math.max(memoryBytes.totalBytes, 0);
  const availableBytes = Math.min(
    Math.max(memoryBytes.availableBytes, 0),
    totalBytes
  );
  const usedBytes = Math.max(totalBytes - availableBytes, 0);
  const [one, five, fifteen] = os.loadavg();

  return {
    hostname: os.hostname(),
    os: operatingSystem,
    kernel: os.release(),
    uptimeSeconds: Math.floor(os.uptime()),
    memory: {
      totalMb: bytesToMegabytes(totalBytes),
      availableMb: bytesToMegabytes(availableBytes),
      usedMb: bytesToMegabytes(usedBytes),
      usedPercent: totalBytes === 0 ? 0 : round((usedBytes / totalBytes) * 100)
    },
    loadAverage: {
      one: round(one, 2),
      five: round(five, 2),
      fifteen: round(fifteen, 2)
    },
    checkedAt: new Date().toISOString()
  };
}

function getRuntimeSnapshot() {
  const memory = process.memoryUsage();

  return {
    status: "online",
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: bytesToMegabytes(memory.rss),
      heapUsedMb: bytesToMegabytes(memory.heapUsed),
      heapTotalMb: bytesToMegabytes(memory.heapTotal)
    },
    checkedAt: new Date().toISOString()
  };
}

function parseHistoryHours(searchParams) {
  const parameterNames = [...new Set(searchParams.keys())];
  const hourValues = searchParams.getAll("hours");

  if (
    parameterNames.some((name) => name !== "hours") ||
    hourValues.length > 1
  ) {
    throw new Error("invalid_history_query");
  }

  if (hourValues.length === 0) {
    return DEFAULT_HISTORY_HOURS;
  }

  const value = hourValues[0];

  if (!/^\d+$/.test(value)) {
    throw new Error("invalid_history_hours");
  }

  const hours = Number(value);

  if (!ALLOWED_HISTORY_HOURS.has(hours)) {
    throw new Error("invalid_history_hours");
  }

  return hours;
}

function toNullableNumber(value) {
  if (value === null) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function serializeHistoryRow(row) {
  const collectedAt = new Date(row.collectedAt);

  return {
    collectedAt: collectedAt.toISOString(),
    apiReachable: row.apiReachable === true,
    systemUptimeSeconds: toNullableNumber(row.systemUptimeSeconds),
    memory: {
      totalMb: toNullableNumber(row.memoryTotalMb),
      availableMb: toNullableNumber(row.memoryAvailableMb),
      usedMb: toNullableNumber(row.memoryUsedMb),
      usedPercent: toNullableNumber(row.memoryUsedPercent)
    },
    loadAverage: {
      one: toNullableNumber(row.loadOne),
      five: toNullableNumber(row.loadFive),
      fifteen: toNullableNumber(row.loadFifteen)
    },
    runtime: {
      uptimeSeconds: toNullableNumber(row.processUptimeSeconds),
      rssMb: toNullableNumber(row.processRssMb),
      heapUsedMb: toNullableNumber(row.processHeapUsedMb),
      heapTotalMb: toNullableNumber(row.processHeapTotalMb)
    }
  };
}

function historyErrorResponse(error) {
  if (error && error.code === "42P01") {
    return {
      statusCode: 503,
      body: {
        error: "monitoring_history_unavailable",
        reason: "migration_not_applied"
      }
    };
  }

  return {
    statusCode: 500,
    body: { error: "monitoring_history_error" }
  };
}

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
  let requestUrl;

  try {
    requestUrl = new URL(req.url || "/", "http://localhost");
  } catch {
    sendJson(res, 400, { error: "invalid_request_url" });
    return;
  }

  const pathname = requestUrl.pathname;
  const serviceMatch = pathname.match(/^\/services\/(\d+)$/);

  if (pathname === "/monitoring/history" && req.method !== "GET") {
    sendJson(
      res,
      405,
      { error: "method_not_allowed" },
      { Allow: "GET" }
    );
    return;
  }

  const isBlockedWrite =
    (req.method === "POST" && pathname === "/services") ||
    ((req.method === "PUT" || req.method === "DELETE") && serviceMatch);

  // Public service mutations are intentionally disabled. This guard must stay
  // before request-body parsing and database access.
  if (!PUBLIC_WRITES_ENABLED && isBlockedWrite) {
    sendJson(
      res,
      405,
      { error: "method_not_allowed" },
      { Allow: "GET" }
    );
    return;
  }

  // HEALTH CHECK
  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  // SYSTEM METRICS - informações públicas explicitamente selecionadas
  if (req.method === "GET" && pathname === "/system") {
    try {
      sendJson(res, 200, await getSystemSnapshot());
    } catch (error) {
      console.error("System metrics failed:", error);
      sendJson(res, 500, { error: "system_metrics_unavailable" });
    }
    return;
  }

  // NODE RUNTIME - sem ambiente, argumentos, PID ou caminhos internos
  if (req.method === "GET" && pathname === "/runtime") {
    sendJson(res, 200, getRuntimeSnapshot());
    return;
  }

  // MONITORING HISTORY - períodos limitados e resposta pública explícita
  if (req.method === "GET" && pathname === "/monitoring/history") {
    let hours;

    try {
      hours = parseHistoryHours(requestUrl.searchParams);
    } catch {
      sendJson(res, 400, {
        error: "invalid_history_period",
        allowedHours: [...ALLOWED_HISTORY_HOURS]
      });
      return;
    }

    try {
      const result = await pool.query(
        HISTORY_SELECT_SQL,
        [hours, MAX_HISTORY_POINTS]
      );

      sendJson(res, 200, {
        hours,
        maxPoints: MAX_HISTORY_POINTS,
        points: result.rows.map(serializeHistoryRow)
      });
    } catch (error) {
      const response = historyErrorResponse(error);

      if (response.statusCode === 500) {
        console.error("Monitoring history query failed.");
      }

      sendJson(res, response.statusCode, response.body);
    }

    return;
  }

  // READ - listar serviços
  if (req.method === "GET" && pathname === "/services") {
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
  if (req.method === "POST" && pathname === "/services") {
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

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`OpsLab API listening on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  ALLOWED_HISTORY_HOURS,
  DEFAULT_HISTORY_HOURS,
  HISTORY_SELECT_SQL,
  MAX_HISTORY_POINTS,
  historyErrorResponse,
  parseHistoryHours,
  serializeHistoryRow
};
