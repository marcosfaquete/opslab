-- OpsLab initial PostgreSQL schema
-- Run against the "opslab" database using an administrative role.

CREATE TABLE public.services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.services
TO opslab_app;