-- Dominio aislado: sin referencia al remitente, IP, agente, sesión o imagen original.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='servired_denuncias_service') THEN
    CREATE ROLE servired_denuncias_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='servired_denuncias_service'
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Rol de denuncias incompatible';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS denuncias_privadas;
REVOKE ALL ON SCHEMA denuncias_privadas FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS denuncias_privadas.denuncias (
  id uuid PRIMARY KEY,
  municipio_id bigint NOT NULL REFERENCES public.municipios(id),
  servicio_id bigint NOT NULL REFERENCES public.servicios(id),
  descripcion text NOT NULL CHECK (char_length(descripcion) BETWEEN 20 AND 2000),
  latitud double precision,
  longitud double precision,
  evidencia bytea CHECK (octet_length(evidencia) <= 460800),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_REVISION','ADMITIDA','DESCARTADA')),
  creada_en timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitud IS NULL AND longitud IS NULL) OR
    (latitud IS NOT NULL AND longitud IS NOT NULL AND latitud BETWEEN -4.3 AND 13.5 AND longitud BETWEEN -82 AND -66))
);
CREATE INDEX IF NOT EXISTS denuncias_estado_fecha ON denuncias_privadas.denuncias(estado, creada_en DESC);
CREATE INDEX IF NOT EXISTS denuncias_fecha ON denuncias_privadas.denuncias(creada_en);

CREATE TABLE IF NOT EXISTS denuncias_privadas.moderaciones (
  id uuid PRIMARY KEY,
  denuncia_id uuid NOT NULL REFERENCES denuncias_privadas.denuncias(id) ON DELETE CASCADE,
  -- Identidad del MODERADOR, nunca del denunciante.
  operador_id uuid NOT NULL REFERENCES public.operadores(id),
  estado_anterior text NOT NULL,
  estado_nuevo text NOT NULL,
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 5 AND 1000),
  creada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS denuncias_moderacion_fecha ON denuncias_privadas.moderaciones(denuncia_id, creada_en DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA denuncias_privadas FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA denuncias_privadas, public TO servired_denuncias_service;
GRANT SELECT, INSERT ON denuncias_privadas.denuncias, denuncias_privadas.moderaciones TO servired_denuncias_service;
GRANT UPDATE (estado, actualizada_en) ON denuncias_privadas.denuncias TO servired_denuncias_service;
GRANT SELECT (id, nombre) ON public.municipios, public.servicios TO servired_denuncias_service;
GRANT SELECT (id, empresa_id) ON public.operadores TO servired_denuncias_service;
GRANT SELECT (empresa_id, servicio_id) ON public.empresa_servicios TO servired_denuncias_service;

ALTER TABLE denuncias_privadas.denuncias ENABLE ROW LEVEL SECURITY;
ALTER TABLE denuncias_privadas.moderaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS denuncias_servicio ON denuncias_privadas.denuncias;
CREATE POLICY denuncias_servicio ON denuncias_privadas.denuncias TO servired_denuncias_service USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS denuncias_servicio ON denuncias_privadas.moderaciones;
CREATE POLICY denuncias_servicio ON denuncias_privadas.moderaciones TO servired_denuncias_service USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS denuncias_catalogo ON public.municipios;
CREATE POLICY denuncias_catalogo ON public.municipios FOR SELECT TO servired_denuncias_service USING (true);
DROP POLICY IF EXISTS denuncias_catalogo ON public.servicios;
CREATE POLICY denuncias_catalogo ON public.servicios FOR SELECT TO servired_denuncias_service USING (true);
DROP POLICY IF EXISTS denuncias_operadores ON public.operadores;
CREATE POLICY denuncias_operadores ON public.operadores FOR SELECT TO servired_denuncias_service USING (true);
DROP POLICY IF EXISTS denuncias_empresa_servicios ON public.empresa_servicios;
CREATE POLICY denuncias_empresa_servicios ON public.empresa_servicios FOR SELECT TO servired_denuncias_service USING (true);
