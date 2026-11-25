-- Exclusivo para una base de pruebas desechable, nunca aplicar a Supabase.
CREATE TABLE public.indicadores_test_fixture (version integer);
INSERT INTO public.indicadores_test_fixture VALUES (1);
CREATE TABLE public.departamentos (id bigint, nombre text, codigo_dane text);
CREATE TABLE public.municipios (id bigint, nombre text, departamento_id bigint);
CREATE TABLE public.servicios (id smallint, nombre text);
CREATE TABLE public.reportes (
  municipio_id bigint, servicio_id smallint, tipo_novedad text, estado text,
  severidad text, fecha_reporte timestamptz, fecha_restablecimiento timestamptz
);
INSERT INTO public.departamentos VALUES (10, 'Departamento de prueba', '01');
INSERT INTO public.municipios VALUES (1, 'San Pedro', 10), (2, 'San Pedro', 10);
INSERT INTO public.servicios VALUES (1, 'Agua'), (2, 'Energía');
INSERT INTO public.reportes VALUES
  (1, 1, 'CORTE', 'REPORTADO', 'ALTA', '2026-01-01 04:59:59Z', NULL),
  (1, 1, 'CORTE', 'RESUELTO', 'MEDIA', '2026-01-01 05:00:00Z', '2026-01-01 07:00:00Z'),
  (1, 2, 'CORTE', 'EN_ATENCION', 'ALTA', '2026-01-31 23:00:00Z', NULL),
  (2, 1, 'FALLA', 'RESUELTO', 'BAJA', '2026-01-15 12:00:00Z', '2026-01-15 16:00:00Z'),
  (2, 1, 'CORTE', 'RESUELTO', 'ALTA', '2026-02-01 04:59:59Z', '2026-02-02 04:59:59Z'),
  (2, 2, 'CORTE', 'RESUELTO', 'MEDIA', '2026-02-01 05:00:00Z', '2026-02-01 08:00:00Z'),
  (1, 1, 'CORTE', 'RESUELTO', 'BAJA', '2026-01-20 13:00:00Z', '2026-01-20 12:00:00Z'),
  (1, 1, 'CORTE', 'RESUELTO', 'BAJA', '2026-01-21 13:00:00Z', '2026-01-21 13:00:00Z');

CREATE ROLE indicadores_test_reader LOGIN PASSWORD 'solo-fixture-desechable'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE indicadores_test_reader SET default_transaction_read_only = on;
GRANT USAGE ON SCHEMA public TO indicadores_test_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO indicadores_test_reader;
