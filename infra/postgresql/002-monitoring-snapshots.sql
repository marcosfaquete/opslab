-- OpsLab monitoring snapshots schema
-- Apply this migration to the "opslab" database using a PostgreSQL
-- administrative role that can create objects in public and grant privileges.

BEGIN;

CREATE TABLE public.monitoring_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    api_reachable BOOLEAN NOT NULL,
    system_uptime_seconds BIGINT,
    memory_total_mb NUMERIC(14, 2),
    memory_available_mb NUMERIC(14, 2),
    memory_used_mb NUMERIC(14, 2),
    memory_used_percent NUMERIC(5, 2),
    load_one NUMERIC(12, 4),
    load_five NUMERIC(12, 4),
    load_fifteen NUMERIC(12, 4),
    process_uptime_seconds BIGINT,
    process_rss_mb NUMERIC(14, 2),
    process_heap_used_mb NUMERIC(14, 2),
    process_heap_total_mb NUMERIC(14, 2),

    CONSTRAINT monitoring_snapshots_system_uptime_nonnegative
        CHECK (system_uptime_seconds IS NULL OR system_uptime_seconds >= 0),
    CONSTRAINT monitoring_snapshots_memory_total_nonnegative
        CHECK (memory_total_mb IS NULL OR memory_total_mb >= 0),
    CONSTRAINT monitoring_snapshots_memory_available_nonnegative
        CHECK (memory_available_mb IS NULL OR memory_available_mb >= 0),
    CONSTRAINT monitoring_snapshots_memory_used_nonnegative
        CHECK (memory_used_mb IS NULL OR memory_used_mb >= 0),
    CONSTRAINT monitoring_snapshots_memory_percent_range
        CHECK (
            memory_used_percent IS NULL
            OR memory_used_percent BETWEEN 0 AND 100
        ),
    CONSTRAINT monitoring_snapshots_memory_available_within_total
        CHECK (
            memory_available_mb IS NULL
            OR memory_total_mb IS NULL
            OR memory_available_mb <= memory_total_mb
        ),
    CONSTRAINT monitoring_snapshots_memory_used_within_total
        CHECK (
            memory_used_mb IS NULL
            OR memory_total_mb IS NULL
            OR memory_used_mb <= memory_total_mb
        ),
    CONSTRAINT monitoring_snapshots_load_one_nonnegative
        CHECK (load_one IS NULL OR load_one >= 0),
    CONSTRAINT monitoring_snapshots_load_five_nonnegative
        CHECK (load_five IS NULL OR load_five >= 0),
    CONSTRAINT monitoring_snapshots_load_fifteen_nonnegative
        CHECK (load_fifteen IS NULL OR load_fifteen >= 0),
    CONSTRAINT monitoring_snapshots_process_uptime_nonnegative
        CHECK (process_uptime_seconds IS NULL OR process_uptime_seconds >= 0),
    CONSTRAINT monitoring_snapshots_process_rss_nonnegative
        CHECK (process_rss_mb IS NULL OR process_rss_mb >= 0),
    CONSTRAINT monitoring_snapshots_process_heap_used_nonnegative
        CHECK (process_heap_used_mb IS NULL OR process_heap_used_mb >= 0),
    CONSTRAINT monitoring_snapshots_process_heap_total_nonnegative
        CHECK (process_heap_total_mb IS NULL OR process_heap_total_mb >= 0),
    CONSTRAINT monitoring_snapshots_process_heap_within_total
        CHECK (
            process_heap_used_mb IS NULL
            OR process_heap_total_mb IS NULL
            OR process_heap_used_mb <= process_heap_total_mb
        ),
    CONSTRAINT monitoring_snapshots_metrics_match_reachability
        CHECK (
            (
                api_reachable
                AND system_uptime_seconds IS NOT NULL
                AND memory_total_mb IS NOT NULL
                AND memory_available_mb IS NOT NULL
                AND memory_used_mb IS NOT NULL
                AND memory_used_percent IS NOT NULL
                AND load_one IS NOT NULL
                AND load_five IS NOT NULL
                AND load_fifteen IS NOT NULL
                AND process_uptime_seconds IS NOT NULL
                AND process_rss_mb IS NOT NULL
                AND process_heap_used_mb IS NOT NULL
                AND process_heap_total_mb IS NOT NULL
            )
            OR
            (
                NOT api_reachable
                AND system_uptime_seconds IS NULL
                AND memory_total_mb IS NULL
                AND memory_available_mb IS NULL
                AND memory_used_mb IS NULL
                AND memory_used_percent IS NULL
                AND load_one IS NULL
                AND load_five IS NULL
                AND load_fifteen IS NULL
                AND process_uptime_seconds IS NULL
                AND process_rss_mb IS NULL
                AND process_heap_used_mb IS NULL
                AND process_heap_total_mb IS NULL
            )
        )
);

CREATE INDEX monitoring_snapshots_collected_at_idx
    ON public.monitoring_snapshots (collected_at DESC);

COMMENT ON TABLE public.monitoring_snapshots IS
    'Periodic OpsLab system and Node.js runtime monitoring snapshots.';

COMMENT ON COLUMN public.monitoring_snapshots.api_reachable IS
    'False means the local metrics API could not be fully validated; all metric columns are NULL.';

REVOKE ALL ON TABLE public.monitoring_snapshots FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.monitoring_snapshots_id_seq FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO opslab_app;
GRANT SELECT, INSERT ON TABLE public.monitoring_snapshots TO opslab_app;
GRANT USAGE ON SEQUENCE public.monitoring_snapshots_id_seq TO opslab_app;

COMMIT;
