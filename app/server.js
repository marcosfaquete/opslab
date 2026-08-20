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
const ALLOWED_NAVIGATION_TYPES = new Set([
  "navigate",
  "reload",
  "back_forward",
  "prerender",
  "unknown"
]);
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return UUID_V4_PATTERN.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function normalizeNavigationType(value) {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim();

  return ALLOWED_NAVIGATION_TYPES.has(normalized)
    ? normalized
    : "unknown";
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
  // ANALYTICS - registrar pageview anônimo
  if (req.method === "POST" && pathname === "/analytics/pageview") {
    try {
      const body = await readJsonBody(req);

      const path =
        typeof body.path === "string"
          ? body.path.trim()
          : "";

      if (
        path.length < 1 ||
        path.length > 512 ||
        !path.startsWith("/")
      ) {
        sendJson(res, 400, {
          error: "invalid_pageview_path"
        });
        return;
      }

      const normalizeOptionalString = (value, maxLength) => {
        if (typeof value !== "string") {
          return null;
        }

        const normalized = value.trim();

        if (normalized === "") {
          return null;
        }

        return normalized.slice(0, maxLength);
      };

      const normalizeScreenDimension = (value) => {
        const number = Number(value);

        if (
          !Number.isInteger(number) ||
          number < 1 ||
          number > 20000
        ) {
          return null;
        }

        return number;
      };

      const normalizePixelRatio = (value) => {
        const number = Number(value);

        if (
          !Number.isFinite(number) ||
          number <= 0 ||
          number > 20
        ) {
          return null;
        }

        return Math.round(number * 100) / 100;
      };

      const referrer =
        normalizeOptionalString(body.referrer, 2048);

      const language =
        normalizeOptionalString(body.language, 64);

      const timezone =
        normalizeOptionalString(body.timezone, 128);

      const screenWidth =
        normalizeScreenDimension(body.screenWidth);

      const screenHeight =
        normalizeScreenDimension(body.screenHeight);

      const viewportWidth =
        normalizeScreenDimension(body.viewportWidth);

      const viewportHeight =
        normalizeScreenDimension(body.viewportHeight);

      const devicePixelRatio =
        normalizePixelRatio(body.devicePixelRatio);

      const utmSource =
        normalizeOptionalString(body.utmSource, 200);

      const utmMedium =
        normalizeOptionalString(body.utmMedium, 200);

      const utmCampaign =
        normalizeOptionalString(body.utmCampaign, 300);

      const utmContent =
        normalizeOptionalString(body.utmContent, 300);

      const utmTerm =
        normalizeOptionalString(body.utmTerm, 300);

      const userAgent =
        normalizeOptionalString(
          req.headers["user-agent"],
          1024
        );


      const visitorId = normalizeUuid(body.visitorId);
      const sessionId = normalizeUuid(body.sessionId);
      const navigationType =
        normalizeNavigationType(body.navigationType);

      const result = await pool.query(
        `INSERT INTO public.analytics_pageviews (
          path,
          referrer,
          language,
          timezone,
          screen_width,
          screen_height,
          user_agent,
          visitor_id,
          session_id,
          navigation_type,
          viewport_width,
          viewport_height,
          device_pixel_ratio,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          utm_term
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18
        )
        RETURNING
          id,
          viewed_at AS "viewedAt";`,
        [
          path,
          referrer,
          language,
          timezone,
          screenWidth,
          screenHeight,
          userAgent,
          visitorId,
          sessionId,
          navigationType,
          viewportWidth,
          viewportHeight,
          devicePixelRatio,
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm
        ]
      );

      sendJson(res, 201, {
        status: "recorded",
        id: result.rows[0].id,
        viewedAt: result.rows[0].viewedAt
      });

    } catch (error) {
      if (error.message === "invalid_json") {
        sendJson(res, 400, {
          error: "invalid_json"
        });
        return;
      }

      console.error(
        "Analytics pageview insert failed:",
        error
      );

      sendJson(res, 500, {
        error: "analytics_database_error"
      });
    }

    return;
  }




  // ANALYTICS - engagement do pageview
  if (req.method === "POST" && pathname === "/analytics/engagement") {
    try {
      const body = await readJsonBody(req);

      const pageviewId = Number(body.pageviewId);

      if (
        !Number.isSafeInteger(pageviewId) ||
        pageviewId < 1
      ) {
        sendJson(res, 400, {
          error: "invalid_engagement_pageview_id"
        });
        return;
      }

      const visitorId = normalizeUuid(body.visitorId);
      const sessionId = normalizeUuid(body.sessionId);

      if (!visitorId || !sessionId) {
        sendJson(res, 400, {
          error: "invalid_engagement_identity"
        });
        return;
      }

      const activeTimeMs = Number(body.activeTimeMs);
      const maxScrollPercent = Number(body.maxScrollPercent);
      const didScroll = body.didScroll === true;

      if (
        !Number.isFinite(activeTimeMs) ||
        activeTimeMs < 0 ||
        activeTimeMs > 86400000
      ) {
        sendJson(res, 400, {
          error: "invalid_engagement_active_time"
        });
        return;
      }

      if (
        !Number.isFinite(maxScrollPercent) ||
        maxScrollPercent < 0 ||
        maxScrollPercent > 100
      ) {
        sendJson(res, 400, {
          error: "invalid_engagement_scroll"
        });
        return;
      }

      const normalizedActiveTime =
        Math.round(activeTimeMs);

      const normalizedScroll =
        Math.round(maxScrollPercent);

      const result = await pool.query(
        `UPDATE public.analytics_pageviews
         SET
           active_time_ms =
             GREATEST(
               active_time_ms,
               $1::bigint
             ),

           max_scroll_percent =
             GREATEST(
               max_scroll_percent,
               $2::smallint
             ),

           did_scroll =
             did_scroll OR $3::boolean,

           engagement_updated_at = now()

         WHERE id = $4
           AND visitor_id = $5::uuid
           AND session_id = $6::uuid

         RETURNING id;`,
        [
          normalizedActiveTime,
          normalizedScroll,
          didScroll,
          pageviewId,
          visitorId,
          sessionId
        ]
      );

      if (result.rowCount === 0) {
        sendJson(res, 404, {
          error: "engagement_pageview_not_found"
        });
        return;
      }

      sendJson(res, 200, {
        status: "updated"
      });

    } catch (error) {
      if (error.message === "invalid_json") {
        sendJson(res, 400, {
          error: "invalid_json"
        });
        return;
      }

      console.error(
        "Analytics engagement update failed:",
        error
      );

      sendJson(res, 500, {
        error: "analytics_engagement_error"
      });
    }

    return;
  }


  // ANALYTICS - histórico detalhado para o painel privado
  if (req.method === "GET" && pathname === "/analytics/pageviews") {
    try {
      const parameterNames = [...new Set(requestUrl.searchParams.keys())];

      if (
        parameterNames.some(
          (name) =>
            name !== "limit" &&
            name !== "beforeId" &&
            name !== "offset" &&
            name !== "mode" &&
            name !== "period"
        )
      ) {
        sendJson(res, 400, {
          error: "invalid_analytics_pageviews_query"
        });
        return;
      }

      const limitRaw = requestUrl.searchParams.get("limit");
      const beforeIdRaw = requestUrl.searchParams.get("beforeId");
      const offsetRaw = requestUrl.searchParams.get("offset");
      const mode =
        requestUrl.searchParams.get("mode") || "recent";
      const period =
        requestUrl.searchParams.get("period") || "all";

      const allowedModes =
        new Set([
          "recent",
          "engaged",
          "time",
          "depth"
        ]);

      const allowedPeriods =
        new Set([
          "today",
          "7d",
          "30d",
          "all"
        ]);

      if (!allowedModes.has(mode)) {
        sendJson(res, 400, {
          error: "invalid_analytics_pageviews_mode"
        });
        return;
      }

      if (!allowedPeriods.has(period)) {
        sendJson(res, 400, {
          error: "invalid_analytics_pageviews_period"
        });
        return;
      }

      let limit = 40;

      if (limitRaw !== null) {
        if (!/^\d+$/.test(limitRaw)) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_limit"
          });
          return;
        }

        limit = Number(limitRaw);

        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100
        ) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_limit"
          });
          return;
        }
      }

      let beforeId = null;

      if (beforeIdRaw !== null) {
        if (!/^\d+$/.test(beforeIdRaw)) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_before_id"
          });
          return;
        }

        beforeId = Number(beforeIdRaw);

        if (
          !Number.isSafeInteger(beforeId) ||
          beforeId < 1
        ) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_before_id"
          });
          return;
        }
      }

      let offset = 0;

      if (offsetRaw !== null) {
        if (!/^\d+$/.test(offsetRaw)) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_offset"
          });
          return;
        }

        offset = Number(offsetRaw);

        if (
          !Number.isSafeInteger(offset) ||
          offset < 0
        ) {
          sendJson(res, 400, {
            error: "invalid_analytics_pageviews_offset"
          });
          return;
        }
      }

      if (mode !== "recent") {
        const orderBy =
          mode === "time"
            ? '"activeTimeMs" DESC, p.id DESC'
            : mode === "depth"
              ? '"maxScrollPercent" DESC, p.id DESC'
              : '"engagementScore" DESC, p.id DESC';

        const rankingResult = await pool.query(
          `
          WITH session_metrics AS (
            SELECT
              session_id,

              COUNT(*) AS session_pageviews,

              COUNT(DISTINCT path) AS distinct_pages,

              COUNT(*) FILTER (
                WHERE navigation_type IN (
                  'navigate',
                  'back_forward'
                )
              ) AS session_navigations

            FROM public.analytics_pageviews

            WHERE session_id IS NOT NULL

            GROUP BY session_id
          ),

          ranked AS (
            SELECT
              p.id,
              p.viewed_at AS "viewedAt",
              p.path,
              p.referrer,
              p.language,
              p.timezone,
              p.screen_width AS "screenWidth",
              p.screen_height AS "screenHeight",
              p.user_agent AS "userAgent",
              p.country_code AS "countryCode",
              p.region,
              p.city,
              p.visitor_id AS "visitorId",
              p.session_id AS "sessionId",
              p.navigation_type AS "navigationType",

              p.active_time_ms AS "activeTimeMs",
              p.max_scroll_percent AS "maxScrollPercent",
              p.did_scroll AS "didScroll",

              p.viewport_width AS "viewportWidth",
              p.viewport_height AS "viewportHeight",
              p.device_pixel_ratio AS "devicePixelRatio",

              p.utm_source AS "utmSource",
              p.utm_medium AS "utmMedium",
              p.utm_campaign AS "utmCampaign",
              p.utm_content AS "utmContent",
              p.utm_term AS "utmTerm",

              p.engagement_updated_at AS "engagementUpdatedAt",

              COALESCE(
                sm.session_pageviews,
                1
              ) AS "sessionPageviews",

              COALESCE(
                sm.distinct_pages,
                1
              ) AS "distinctPages",

              COALESCE(
                sm.session_navigations,
                CASE
                  WHEN p.navigation_type IN (
                    'navigate',
                    'back_forward'
                  )
                  THEN 1
                  ELSE 0
                END
              ) AS "sessionNavigations",

              ROUND(
                (
                  LEAST(
                    COALESCE(
                      p.active_time_ms,
                      0
                    )::numeric / 120000,
                    1
                  ) * 45
                )

                +

                (
                  LEAST(
                    COALESCE(
                      p.max_scroll_percent,
                      0
                    )::numeric / 100,
                    1
                  ) * 25
                )

                +

                (
                  CASE
                    WHEN p.did_scroll IS TRUE
                    THEN 10
                    ELSE 0
                  END
                )

                +

                (
                  LEAST(
                    GREATEST(
                      COALESCE(
                        sm.distinct_pages,
                        1
                      ) - 1,
                      0
                    )::numeric,
                    1
                  ) * 10
                )

                +

                (
                  LEAST(
                    GREATEST(
                      COALESCE(
                        sm.session_navigations,
                        1
                      ) - 1,
                      0
                    )::numeric / 2,
                    1
                  ) * 10
                )
              )::integer AS "engagementScore"

            FROM public.analytics_pageviews p

            LEFT JOIN session_metrics sm
              ON sm.session_id = p.session_id

            WHERE
              p.engagement_updated_at IS NOT NULL

              AND (
                $1::text = 'all'

                OR (
                  $1::text = 'today'
                  AND p.viewed_at >=
                    date_trunc(
                      'day',
                      now() AT TIME ZONE 'America/Sao_Paulo'
                    ) AT TIME ZONE 'America/Sao_Paulo'
                )

                OR (
                  $1::text = '7d'
                  AND p.viewed_at >=
                    now() - interval '7 days'
                )

                OR (
                  $1::text = '30d'
                  AND p.viewed_at >=
                    now() - interval '30 days'
                )
              )
          )

          SELECT *
          FROM ranked p
          ORDER BY ${orderBy}
          LIMIT $2
          OFFSET $3;          `,
          [
            period,
            limit + 1,
            offset
          ]
        );

        const hasMore =
          rankingResult.rows.length > limit;

        const items =
          rankingResult.rows
            .slice(0, limit)
            .map((row) => ({
            ...row,

            id: Number(row.id),

            activeTimeMs:
              Number(row.activeTimeMs || 0),

            maxScrollPercent:
              Number(row.maxScrollPercent || 0),

            viewportWidth:
              row.viewportWidth === null
                ? null
                : Number(row.viewportWidth),

            viewportHeight:
              row.viewportHeight === null
                ? null
                : Number(row.viewportHeight),

            devicePixelRatio:
              row.devicePixelRatio === null
                ? null
                : Number(row.devicePixelRatio),

            sessionPageviews:
              Number(row.sessionPageviews || 1),

            distinctPages:
              Number(row.distinctPages || 1),

            sessionNavigations:
              Number(row.sessionNavigations || 0),

            didScroll:
              row.didScroll === true,

            engagementScore:
              Number(row.engagementScore || 0)
          }));

        sendJson(
          res,
          200,
          {
            items,
            hasMore,
            nextBeforeId: null,
            nextOffset:
              hasMore
                ? offset + limit
                : null,
            mode,
            period
          },
          {
            "Cache-Control": "no-store"
          }
        );

        return;
      }

      const result = await pool.query(
        `
        SELECT
          id,
          viewed_at AS "viewedAt",
          path,
          referrer,
          language,
          timezone,
          screen_width AS "screenWidth",
          screen_height AS "screenHeight",
          user_agent AS "userAgent",
          country_code AS "countryCode",
          region,
          city,
          visitor_id AS "visitorId",
          session_id AS "sessionId",
          navigation_type AS "navigationType",
          active_time_ms AS "activeTimeMs",
          max_scroll_percent AS "maxScrollPercent",
          did_scroll AS "didScroll",
          viewport_width AS "viewportWidth",
          viewport_height AS "viewportHeight",
          device_pixel_ratio AS "devicePixelRatio",
          utm_source AS "utmSource",
          utm_medium AS "utmMedium",
          utm_campaign AS "utmCampaign",
          utm_content AS "utmContent",
          utm_term AS "utmTerm",
          engagement_updated_at AS "engagementUpdatedAt"

        FROM public.analytics_pageviews

        WHERE (
          $1::bigint IS NULL
          OR id < $1::bigint
        )

        ORDER BY id DESC

        LIMIT $2;
        `,
        [
          beforeId,
          limit + 1
        ]
      );

      const hasMore = result.rows.length > limit;

      const items = result.rows
        .slice(0, limit)
        .map((row) => ({
          ...row,

          id: Number(row.id),

          activeTimeMs:
            Number(row.activeTimeMs || 0),

          maxScrollPercent:
            Number(row.maxScrollPercent || 0),

          viewportWidth:
            row.viewportWidth === null
              ? null
              : Number(row.viewportWidth),

          viewportHeight:
            row.viewportHeight === null
              ? null
              : Number(row.viewportHeight),

          devicePixelRatio:
            row.devicePixelRatio === null
              ? null
              : Number(row.devicePixelRatio)
        }));

      const nextBeforeId =
        hasMore && items.length
          ? items[items.length - 1].id
          : null;

      sendJson(
        res,
        200,
        {
          items,
          hasMore,
          nextBeforeId
        },
        {
          "Cache-Control": "no-store"
        }
      );
    } catch (error) {
      console.error(
        "Analytics pageviews query failed:",
        error
      );

      sendJson(res, 500, {
        error: "analytics_pageviews_error"
      });
    }

    return;
  }


  // ANALYTICS - resumo agregado para o painel privado
  if (req.method === "GET" && pathname === "/analytics/summary") {
    try {
      const result = await pool.query(`
        WITH bounds AS (
          SELECT
            (
              date_trunc(
                'day',
                now() AT TIME ZONE 'America/Sao_Paulo'
              )
              AT TIME ZONE 'America/Sao_Paulo'
            ) AS today_start,
            now() - interval '7 days' AS last7_start
        )
        SELECT
          COUNT(*)::int AS "pageviewsTotal",

          COUNT(*) FILTER (
            WHERE viewed_at >= (
              SELECT today_start FROM bounds
            )
          )::int AS "pageviewsToday",

          COUNT(*) FILTER (
            WHERE viewed_at >= (
              SELECT last7_start FROM bounds
            )
          )::int AS "pageviewsLast7Days",

          COUNT(DISTINCT visitor_id) FILTER (
            WHERE visitor_id IS NOT NULL
          )::int AS "visitorsTotal",

          COUNT(DISTINCT visitor_id) FILTER (
            WHERE visitor_id IS NOT NULL
              AND viewed_at >= (
                SELECT today_start FROM bounds
              )
          )::int AS "visitorsToday",

          COUNT(DISTINCT visitor_id) FILTER (
            WHERE visitor_id IS NOT NULL
              AND viewed_at >= (
                SELECT last7_start FROM bounds
              )
          )::int AS "visitorsLast7Days",

          COUNT(DISTINCT session_id) FILTER (
            WHERE session_id IS NOT NULL
          )::int AS "sessionsTotal",

          COUNT(DISTINCT session_id) FILTER (
            WHERE session_id IS NOT NULL
              AND viewed_at >= (
                SELECT today_start FROM bounds
              )
          )::int AS "sessionsToday",

          COUNT(DISTINCT session_id) FILTER (
            WHERE session_id IS NOT NULL
              AND viewed_at >= (
                SELECT last7_start FROM bounds
              )
          )::int AS "sessionsLast7Days",

          COUNT(*) FILTER (
            WHERE navigation_type = 'reload'
          )::int AS "reloadsTotal",

          COUNT(*) FILTER (
            WHERE navigation_type = 'reload'
              AND viewed_at >= (
                SELECT today_start FROM bounds
              )
          )::int AS "reloadsToday",

          COUNT(*) FILTER (
            WHERE navigation_type = 'reload'
              AND viewed_at >= (
                SELECT last7_start FROM bounds
              )
          )::int AS "reloadsLast7Days",

          COUNT(*) FILTER (
            WHERE path = '/'
          )::int AS "homeTotal",

          COUNT(*) FILTER (
            WHERE path = '/'
              AND viewed_at >= (
                SELECT today_start FROM bounds
              )
          )::int AS "homeToday",

          COUNT(*) FILTER (
            WHERE path = '/opslab/'
          )::int AS "opslabTotal",

          COUNT(*) FILTER (
            WHERE path = '/opslab/'
              AND viewed_at >= (
                SELECT today_start FROM bounds
              )
          )::int AS "opslabToday"

        FROM public.analytics_pageviews;
      `);

      const row = result.rows[0];

      sendJson(
        res,
        200,
        {
          generatedAt: new Date().toISOString(),

          pageviews: {
            total: row.pageviewsTotal,
            today: row.pageviewsToday,
            last7Days: row.pageviewsLast7Days
          },

          visitors: {
            total: row.visitorsTotal,
            today: row.visitorsToday,
            last7Days: row.visitorsLast7Days
          },

          sessions: {
            total: row.sessionsTotal,
            today: row.sessionsToday,
            last7Days: row.sessionsLast7Days
          },

          navigation: {
            reloadsTotal: row.reloadsTotal,
            reloadsToday: row.reloadsToday,
            reloadsLast7Days: row.reloadsLast7Days
          },

          pages: {
            home: {
              total: row.homeTotal,
              today: row.homeToday
            },
            opslab: {
              total: row.opslabTotal,
              today: row.opslabToday
            }
          }
        },
        {
          "Cache-Control": "no-store"
        }
      );
    } catch (error) {
      console.error(
        "Analytics summary query failed:",
        error
      );

      sendJson(res, 500, {
        error: "analytics_summary_error"
      });
    }

    return;
  }


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
