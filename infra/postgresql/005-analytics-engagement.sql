-- Analytics v3
-- Engagement, viewport e campanhas first-party.

BEGIN;

ALTER TABLE public.analytics_pageviews

  ADD COLUMN IF NOT EXISTS active_time_ms BIGINT
    NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS max_scroll_percent SMALLINT
    NOT NULL DEFAULT 0,

  ADD COLUMN IF NOT EXISTS viewport_width INTEGER,

  ADD COLUMN IF NOT EXISTS viewport_height INTEGER,

  ADD COLUMN IF NOT EXISTS device_pixel_ratio NUMERIC(5,2),

  ADD COLUMN IF NOT EXISTS utm_source TEXT,

  ADD COLUMN IF NOT EXISTS utm_medium TEXT,

  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,

  ADD COLUMN IF NOT EXISTS utm_content TEXT,

  ADD COLUMN IF NOT EXISTS utm_term TEXT,

  ADD COLUMN IF NOT EXISTS engagement_updated_at TIMESTAMPTZ;


DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_pageviews_scroll_check'
      AND conrelid = 'public.analytics_pageviews'::regclass
  ) THEN

    ALTER TABLE public.analytics_pageviews
      ADD CONSTRAINT analytics_pageviews_scroll_check
      CHECK (
        max_scroll_percent >= 0
        AND max_scroll_percent <= 100
      );

  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_pageviews_active_time_check'
      AND conrelid = 'public.analytics_pageviews'::regclass
  ) THEN

    ALTER TABLE public.analytics_pageviews
      ADD CONSTRAINT analytics_pageviews_active_time_check
      CHECK (active_time_ms >= 0);

  END IF;

END
$$;


CREATE INDEX IF NOT EXISTS analytics_pageviews_session_viewed_at_idx
  ON public.analytics_pageviews (
    session_id,
    viewed_at
  )
  WHERE session_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS analytics_pageviews_visitor_viewed_at_idx
  ON public.analytics_pageviews (
    visitor_id,
    viewed_at
  )
  WHERE visitor_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS analytics_pageviews_utm_source_idx
  ON public.analytics_pageviews (utm_source)
  WHERE utm_source IS NOT NULL;


COMMENT ON COLUMN public.analytics_pageviews.active_time_ms IS
  'Tempo em milissegundos em que a pagina permaneceu efetivamente visivel/ativa.';

COMMENT ON COLUMN public.analytics_pageviews.max_scroll_percent IS
  'Maior percentual de scroll alcançado no pageview, entre 0 e 100.';

COMMENT ON COLUMN public.analytics_pageviews.viewport_width IS
  'Largura interna da janela do navegador em pixels CSS.';

COMMENT ON COLUMN public.analytics_pageviews.viewport_height IS
  'Altura interna da janela do navegador em pixels CSS.';

COMMENT ON COLUMN public.analytics_pageviews.device_pixel_ratio IS
  'devicePixelRatio informado pelo navegador.';

COMMENT ON COLUMN public.analytics_pageviews.engagement_updated_at IS
  'Última atualização das métricas de engajamento deste pageview.';

COMMIT;
