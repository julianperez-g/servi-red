-- Rol de grupo sin login: únicamente los procesos de indicadores deben recibirlo.
-- No se otorgan permisos a anon, authenticated ni a las cuentas ciudadanas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servired_indicadores_reader') THEN
    CREATE ROLE servired_indicadores_reader NOLOGIN NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'servired_indicadores_reader'
      AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'El rol servired_indicadores_reader ya existe con privilegios incompatibles';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO servired_indicadores_reader;
GRANT SELECT (municipio_id, servicio_id, tipo_novedad, estado, severidad,
  fecha_reporte, fecha_restablecimiento)
  ON public.reportes TO servired_indicadores_reader;
GRANT SELECT (id, nombre, departamento_id)
  ON public.municipios TO servired_indicadores_reader;
GRANT SELECT (id, nombre) ON public.servicios TO servired_indicadores_reader;
GRANT SELECT (id, nombre, codigo_dane)
  ON public.departamentos TO servired_indicadores_reader;

-- Las políticas solo aplican al nuevo rol. Los permisos por columna excluyen
-- descripciones, coordenadas, ciudadano_id, evidencias y datos de autenticación.
DROP POLICY IF EXISTS indicadores_lectura ON public.reportes;
CREATE POLICY indicadores_lectura ON public.reportes
  FOR SELECT TO servired_indicadores_reader USING (true);
DROP POLICY IF EXISTS indicadores_lectura ON public.municipios;
CREATE POLICY indicadores_lectura ON public.municipios
  FOR SELECT TO servired_indicadores_reader USING (true);
DROP POLICY IF EXISTS indicadores_lectura ON public.servicios;
CREATE POLICY indicadores_lectura ON public.servicios
  FOR SELECT TO servired_indicadores_reader USING (true);
DROP POLICY IF EXISTS indicadores_lectura ON public.departamentos;
CREATE POLICY indicadores_lectura ON public.departamentos
  FOR SELECT TO servired_indicadores_reader USING (true);
