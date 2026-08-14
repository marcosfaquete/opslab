"use strict";

const { Pool } = require("pg");

const REQUEST_TIMEOUT_MS = 6000;
const SYSTEM_URL = "http://127.0.0.1:3000/system";
const RUNTIME_URL = "http://127.0.0.1:3000/runtime";

const INSERT_SNAPSHOT_SQL = [
  "INSERT INTO public.monitoring_snapshots (",
  "  api_reachable,",
  "  system_uptime_seconds,",
  "  memory_total_mb,",
  "  memory_available_mb,",
  "  memory_used_mb,",
  "  memory_used_percent,",
  "  load_one,",
  "  load_five,",
  "  load_fifteen,",
  "  process_uptime_seconds,",
  "  process_rss_mb,",
  "  process_heap_used_mb,",
  "  process_heap_total_mb",
  ")",
  "VALUES (",
  "  $1, $2, $3, $4, $5, $6, $7,",
  "  $8, $9, $10, $11, $12, $13",
  ");"
].join("\n");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("invalid_" + field);
  }

  return value;
}

function requireNonnegativeNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("invalid_" + field);
  }

  return value;
}

function validateSystemPayload(system) {
  if (!isObject(system) || !isObject(system.memory) || !isObject(system.loadAverage)) {
    throw new Error("invalid_system_payload");
  }

  const usedPercent = requireNonnegativeNumber(
    system.memory.usedPercent,
    "memory_used_percent"
  );

  if (usedPercent > 100) {
    throw new Error("invalid_memory_used_percent");
  }

  return {
    hostname: requireString(system.hostname, "hostname"),
    os: requireString(system.os, "os"),
    kernel: requireString(system.kernel, "kernel"),
    uptimeSeconds: requireNonnegativeNumber(
      system.uptimeSeconds,
      "system_uptime_seconds"
    ),
    memory: {
      totalMb: requireNonnegativeNumber(system.memory.totalMb, "memory_total_mb"),
      availableMb: requireNonnegativeNumber(
        system.memory.availableMb,
        "memory_available_mb"
      ),
      usedMb: requireNonnegativeNumber(system.memory.usedMb, "memory_used_mb"),
      usedPercent
    },
    loadAverage: {
      one: requireNonnegativeNumber(system.loadAverage.one, "load_one"),
      five: requireNonnegativeNumber(system.loadAverage.five, "load_five"),
      fifteen: requireNonnegativeNumber(system.loadAverage.fifteen, "load_fifteen")
    },
    checkedAt: requireString(system.checkedAt, "system_checked_at")
  };
}

function validateRuntimePayload(runtime) {
  if (
    !isObject(runtime) ||
    runtime.status !== "online" ||
    !isObject(runtime.memory)
  ) {
    throw new Error("invalid_runtime_payload");
  }

  return {
    status: "online",
    nodeVersion: requireString(runtime.nodeVersion, "node_version"),
    uptimeSeconds: requireNonnegativeNumber(
      runtime.uptimeSeconds,
      "process_uptime_seconds"
    ),
    memory: {
      rssMb: requireNonnegativeNumber(runtime.memory.rssMb, "process_rss_mb"),
      heapUsedMb: requireNonnegativeNumber(
        runtime.memory.heapUsedMb,
        "process_heap_used_mb"
      ),
      heapTotalMb: requireNonnegativeNumber(
        runtime.memory.heapTotalMb,
        "process_heap_total_mb"
      )
    },
    checkedAt: requireString(runtime.checkedAt, "runtime_checked_at")
  };
}

async function fetchJson(url, fetchImplementation = fetch) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImplementation(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("metrics_http_error");
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildReachableSnapshot(system, runtime) {
  const validatedSystem = validateSystemPayload(system);
  const validatedRuntime = validateRuntimePayload(runtime);

  return {
    apiReachable: true,
    systemUptimeSeconds: validatedSystem.uptimeSeconds,
    memoryTotalMb: validatedSystem.memory.totalMb,
    memoryAvailableMb: validatedSystem.memory.availableMb,
    memoryUsedMb: validatedSystem.memory.usedMb,
    memoryUsedPercent: validatedSystem.memory.usedPercent,
    loadOne: validatedSystem.loadAverage.one,
    loadFive: validatedSystem.loadAverage.five,
    loadFifteen: validatedSystem.loadAverage.fifteen,
    processUptimeSeconds: validatedRuntime.uptimeSeconds,
    processRssMb: validatedRuntime.memory.rssMb,
    processHeapUsedMb: validatedRuntime.memory.heapUsedMb,
    processHeapTotalMb: validatedRuntime.memory.heapTotalMb
  };
}

function buildUnreachableSnapshot() {
  return {
    apiReachable: false,
    systemUptimeSeconds: null,
    memoryTotalMb: null,
    memoryAvailableMb: null,
    memoryUsedMb: null,
    memoryUsedPercent: null,
    loadOne: null,
    loadFive: null,
    loadFifteen: null,
    processUptimeSeconds: null,
    processRssMb: null,
    processHeapUsedMb: null,
    processHeapTotalMb: null
  };
}

function snapshotParameters(snapshot) {
  return [
    snapshot.apiReachable,
    snapshot.systemUptimeSeconds,
    snapshot.memoryTotalMb,
    snapshot.memoryAvailableMb,
    snapshot.memoryUsedMb,
    snapshot.memoryUsedPercent,
    snapshot.loadOne,
    snapshot.loadFive,
    snapshot.loadFifteen,
    snapshot.processUptimeSeconds,
    snapshot.processRssMb,
    snapshot.processHeapUsedMb,
    snapshot.processHeapTotalMb
  ];
}

async function collectSnapshot(fetchImplementation = fetch) {
  const [systemResult, runtimeResult] = await Promise.allSettled([
    fetchJson(SYSTEM_URL, fetchImplementation),
    fetchJson(RUNTIME_URL, fetchImplementation)
  ]);

  if (
    systemResult.status !== "fulfilled" ||
    runtimeResult.status !== "fulfilled"
  ) {
    return buildUnreachableSnapshot();
  }

  try {
    return buildReachableSnapshot(systemResult.value, runtimeResult.value);
  } catch {
    return buildUnreachableSnapshot();
  }
}

async function insertSnapshot(pool, snapshot) {
  await pool.query(INSERT_SNAPSHOT_SQL, snapshotParameters(snapshot));
}

async function main() {
  const pool = new Pool();

  try {
    const snapshot = await collectSnapshot();

    if (!snapshot.apiReachable) {
      console.warn(
        "OpsLab metrics API unavailable; storing an unreachable snapshot without metric values."
      );
    }

    await insertSnapshot(pool, snapshot);
    console.log(
      "OpsLab monitoring snapshot stored (api_reachable=" +
        String(snapshot.apiReachable) +
        ")."
    );
  } catch (error) {
    if (error && error.code === "42P01") {
      console.error(
        "OpsLab snapshot storage unavailable: migration 002 has not been applied."
      );
    } else {
      console.error("OpsLab snapshot collection failed.");
    }

    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {
      process.exitCode = 1;
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  INSERT_SNAPSHOT_SQL,
  buildReachableSnapshot,
  buildUnreachableSnapshot,
  collectSnapshot,
  insertSnapshot,
  snapshotParameters,
  validateRuntimePayload,
  validateSystemPayload
};
