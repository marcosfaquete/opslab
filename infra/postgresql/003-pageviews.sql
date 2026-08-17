-- OpsLab / Marcos Lab pageview analytics schema
-- Stores anonymous first-party pageview events.
-- Raw client IP addresses are intentionally not persisted.

BEGIN;

CREATE TABLE public.analytics_pageviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    path TEXT NOT NULL,
    referrer TEXT,

    language VARCHAR(64),
    timezone VARCHAR(128),

    screen_width INTEGER,
    screen_height INTEGER,

    user_agent TEXT,

    -- Reserved for approximate IP-derived geolocation.
    -- We will populate these later without storing the raw IP.
    country_code CHAR(2),
    region VARCHAR(128),
    city VARCHAR(128),

    CONSTRAINT analytics_pageviews_path_valid
        CHECK (
            char_length(path) BETWEEN 1 AND 512
            AND path LIKE '/%'
        ),

    CONSTRAINT analytics_pageviews_referrer_length
        CHECK (
            referrer IS NULL
            OR char_length(referrer) <= 2048
        ),

    CONSTRAINT analytics_pageviews_user_agent_length
        CHECK (
            user_agent IS NULL
            OR char_length(user_agent) <= 1024
        ),

    CONSTRAINT analytics_pageviews_screen_width_valid
        CHECK (
            screen_width IS NULL
            OR screen_width BETWEEN 1 AND 20000
        ),

    CONSTRAINT analytics_pageviews_screen_height_valid
        CHECK (
            screen_height IS NULL
            OR screen_height BETWEEN 1 AND 20000
        ),

    CONSTRAINT analytics_pageviews_country_code_valid
        CHECK (
            country_code IS NULL
            OR country_code ~ '^[A-Z]{2}$'
        )
);

CREATE INDEX analytics_pageviews_viewed_at_idx
    ON public.analytics_pageviews (viewed_at DESC);

CREATE INDEX analytics_pageviews_path_viewed_at_idx
    ON public.analytics_pageviews (path, viewed_at DESC);

COMMENT ON TABLE public.analytics_pageviews IS
    'Anonymous first-party pageview analytics for Marcos Lab and OpsLab.';

COMMENT ON COLUMN public.analytics_pageviews.country_code IS
    'Approximate country derived from client network location; raw IP is not stored.';

REVOKE ALL ON TABLE public.analytics_pageviews FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.analytics_pageviews_id_seq FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO opslab_app;

GRANT SELECT, INSERT
    ON TABLE public.analytics_pageviews
    TO opslab_app;

GRANT USAGE
    ON SEQUENCE public.analytics_pageviews_id_seq
    TO opslab_app;

COMMIT;
