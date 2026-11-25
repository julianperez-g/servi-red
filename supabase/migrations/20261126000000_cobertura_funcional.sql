-- Cambio aditivo: los datos históricos y mensajes anteriores conservan NULL.
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS categoria_incidente text,
  ADD COLUMN IF NOT EXISTS fecha_inicio_estimada timestamptz,
  ADD COLUMN IF NOT EXISTS area_afectada_geojson jsonb,
  ADD COLUMN IF NOT EXISTS area_afectada_m2 numeric;

CREATE OR REPLACE FUNCTION public.validar_area_reportada(area jsonb, lat double precision, lng double precision)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE geom extensions.geometry; punto jsonb; superficie numeric;
BEGIN
  IF area IS NULL OR area = 'null'::jsonb THEN RETURN NULL; END IF;
  IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -4.3 AND 13.5 OR lng NOT BETWEEN -82 AND -66 THEN
    RAISE EXCEPTION 'Punto de referencia no permitido' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(area) IS DISTINCT FROM 'object' OR area->>'type' IS DISTINCT FROM 'Polygon'
    OR NOT (area ?& ARRAY['type','coordinates'])
    OR (SELECT count(*) FROM jsonb_object_keys(area)) <> 2
    OR jsonb_typeof(area->'coordinates') <> 'array' OR jsonb_array_length(area->'coordinates') <> 1
    OR jsonb_typeof(area->'coordinates'->0) <> 'array'
    OR jsonb_array_length(area->'coordinates'->0) NOT BETWEEN 4 AND 101 THEN
    RAISE EXCEPTION 'Polígono no permitido' USING ERRCODE='22023';
  END IF;
  FOR punto IN SELECT value FROM jsonb_array_elements(area->'coordinates'->0) LOOP
    IF jsonb_typeof(punto) <> 'array' OR jsonb_array_length(punto) <> 2
      OR jsonb_typeof(punto->0) <> 'number' OR jsonb_typeof(punto->1) <> 'number'
      OR (punto->>0)::double precision NOT BETWEEN -82 AND -66
      OR (punto->>1)::double precision NOT BETWEEN -4.3 AND 13.5 THEN
      RAISE EXCEPTION 'Coordenadas no permitidas' USING ERRCODE='22023';
    END IF;
  END LOOP;
  geom := extensions.ST_GeomFromGeoJSON(area::text);
  IF extensions.ST_SRID(geom) <> 4326 OR extensions.ST_NDims(geom) <> 2
    OR NOT extensions.ST_IsValid(geom) OR extensions.ST_IsEmpty(geom)
    OR NOT extensions.ST_Covers(geom, extensions.ST_SetSRID(extensions.ST_MakePoint(lng,lat),4326)) THEN
    RAISE EXCEPTION 'Área inválida o punto fuera del contorno' USING ERRCODE='22023';
  END IF;
  superficie := round(extensions.ST_Area(geom::extensions.geography)::numeric,2);
  IF superficie IS NULL OR superficie <= 0 THEN
    RAISE EXCEPTION 'El área debe tener superficie positiva' USING ERRCODE='22023';
  END IF;
  RETURN superficie;
END $$;

-- No crear un RPC público de cálculo. API/worker usan su conexión de servidor.
REVOKE EXECUTE ON FUNCTION public.validar_area_reportada(jsonb,double precision,double precision) FROM PUBLIC;
DO $$ DECLARE rol text; BEGIN
  FOR rol IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.validar_area_reportada(jsonb,double precision,double precision) FROM %I',rol);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.calcular_cobertura_reporte()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog, public, extensions AS $$
BEGIN
  NEW.area_afectada_m2 := public.validar_area_reportada(NEW.area_afectada_geojson,
    extensions.ST_Y(NEW.ubicacion::extensions.geometry),extensions.ST_X(NEW.ubicacion::extensions.geometry));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS calcular_cobertura_reporte ON public.reportes;
CREATE TRIGGER calcular_cobertura_reporte BEFORE INSERT OR UPDATE ON public.reportes
  FOR EACH ROW EXECUTE FUNCTION public.calcular_cobertura_reporte();

ALTER TABLE public.reportes DROP CONSTRAINT IF EXISTS reportes_inicio_estimado_check;
ALTER TABLE public.reportes ADD CONSTRAINT reportes_inicio_estimado_check
  CHECK (fecha_inicio_estimada IS NULL OR (isfinite(fecha_inicio_estimada) AND fecha_inicio_estimada <= fecha_reporte));
ALTER TABLE public.reportes DROP CONSTRAINT IF EXISTS reportes_categoria_incidente_check;
ALTER TABLE public.reportes ADD CONSTRAINT reportes_categoria_incidente_check CHECK (
  categoria_incidente IS NULL OR
  (servicio_id=4 AND tipo_novedad::text='FALLA' AND categoria_incidente IN ('OBSTRUCCION','DESBORDAMIENTO','DANO_RED')) OR
  (servicio_id=5 AND tipo_novedad::text='FALLA' AND categoria_incidente IN ('RECOLECCION_INCUMPLIDA','ACUMULACION_RESIDUOS')) OR
  (servicio_id=5 AND tipo_novedad::text='BAJA_CALIDAD' AND categoria_incidente='BARRIDO_DEFICIENTE')
);
COMMENT ON COLUMN public.reportes.fecha_inicio_estimada IS 'Estimación declarada por el ciudadano; no reemplaza fecha_reporte ni acredita inicio real.';
COMMENT ON COLUMN public.reportes.area_afectada_m2 IS 'Superficie individual calculada en servidor con PostGIS. No sumar como cobertura única: puede haber solapamientos.';
