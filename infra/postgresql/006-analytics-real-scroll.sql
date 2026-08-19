BEGIN;

ALTER TABLE public.analytics_pageviews
  ADD COLUMN IF NOT EXISTS did_scroll BOOLEAN
  NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.analytics_pageviews.did_scroll IS
  'Indica se houve evento real de scroll durante o pageview.';

GRANT UPDATE (did_scroll)
ON TABLE public.analytics_pageviews
TO opslab_app;

COMMIT;
