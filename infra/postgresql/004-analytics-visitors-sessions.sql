-- Analytics: visitantes anônimos, sessões e tipo de navegação

BEGIN;

ALTER TABLE public.analytics_pageviews
  ADD COLUMN IF NOT EXISTS visitor_id UUID,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS navigation_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_pageviews_navigation_type_check'
      AND conrelid = 'public.analytics_pageviews'::regclass
  ) THEN
    ALTER TABLE public.analytics_pageviews
      ADD CONSTRAINT analytics_pageviews_navigation_type_check
      CHECK (
        navigation_type IS NULL
        OR navigation_type IN (
          'navigate',
          'reload',
          'back_forward',
          'prerender',
          'unknown'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS analytics_pageviews_visitor_id_idx
  ON public.analytics_pageviews (visitor_id)
  WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_pageviews_session_id_idx
  ON public.analytics_pageviews (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_pageviews_viewed_at_idx
  ON public.analytics_pageviews (viewed_at DESC);

CREATE INDEX IF NOT EXISTS analytics_pageviews_viewed_at_visitor_idx
  ON public.analytics_pageviews (viewed_at DESC, visitor_id)
  WHERE visitor_id IS NOT NULL;

COMMENT ON COLUMN public.analytics_pageviews.visitor_id IS
  'Identificador anonimo do navegador persistido no frontend.';

COMMENT ON COLUMN public.analytics_pageviews.session_id IS
  'Identificador anonimo da sessao de navegacao.';

COMMENT ON COLUMN public.analytics_pageviews.navigation_type IS
  'Tipo de navegacao: navigate, reload, back_forward, prerender ou unknown.';

COMMIT;
