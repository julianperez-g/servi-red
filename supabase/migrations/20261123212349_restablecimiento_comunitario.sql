-- Vincula los reportes nuevos con la cuenta ciudadana que los creó.
-- Los reportes anónimos/antiguos conservan ciudadano_id NULL.
ALTER TABLE public.reportes
  ADD COLUMN IF NOT EXISTS ciudadano_id uuid
  REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reportes_ciudadano_fecha_idx
  ON public.reportes (ciudadano_id, fecha_reporte DESC)
  WHERE ciudadano_id IS NOT NULL;

-- El ciudadano puede avisar antes de que el operador registre el cierre.
CREATE TABLE IF NOT EXISTS public.avisos_restablecimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL
    REFERENCES public.reportes (id) ON DELETE CASCADE,
  ciudadano_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  fecha_servicio_reportada timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporte_id, ciudadano_id)
);

CREATE INDEX IF NOT EXISTS avisos_restablecimiento_reporte_idx
  ON public.avisos_restablecimiento (reporte_id, creado_en DESC);

-- Cada registro del operador es una tentativa auditable de restablecimiento.
CREATE TABLE IF NOT EXISTS public.restablecimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL
    REFERENCES public.reportes (id) ON DELETE CASCADE,
  operador_id uuid NOT NULL
    REFERENCES public.operadores (id),
  fecha_restablecimiento timestamptz NOT NULL,
  acciones text NOT NULL,
  estado_validacion text NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_validacion IN ('PENDIENTE', 'CONFIRMADO', 'OBSERVADO')),
  respuesta_ciudadano text
    CHECK (respuesta_ciudadano IS NULL OR
      respuesta_ciudadano IN ('CONFIRMO', 'SIGUE_SIN_SERVICIO')),
  confirmado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  confirmado_en timestamptz,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(acciones)) BETWEEN 5 AND 2000),
  CHECK (
    (estado_validacion = 'PENDIENTE' AND respuesta_ciudadano IS NULL
      AND confirmado_por IS NULL AND confirmado_en IS NULL)
    OR (estado_validacion = 'CONFIRMADO'
      AND respuesta_ciudadano = 'CONFIRMO'
      AND confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)
    OR (estado_validacion = 'OBSERVADO'
      AND respuesta_ciudadano = 'SIGUE_SIN_SERVICIO'
      AND confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS restablecimientos_reporte_reciente_idx
  ON public.restablecimientos (reporte_id, registrado_en DESC);

-- Mantiene la respuesta auditada aunque la cuenta del ciudadano sea eliminada.
ALTER TABLE public.restablecimientos
  DROP CONSTRAINT IF EXISTS restablecimientos_check;
ALTER TABLE public.restablecimientos
  DROP CONSTRAINT IF EXISTS restablecimientos_validacion_coherente_check;
ALTER TABLE public.restablecimientos
  ADD CONSTRAINT restablecimientos_validacion_coherente_check CHECK (
    (estado_validacion = 'PENDIENTE' AND respuesta_ciudadano IS NULL
      AND confirmado_por IS NULL AND confirmado_en IS NULL)
    OR (estado_validacion = 'CONFIRMADO'
      AND respuesta_ciudadano = 'CONFIRMO' AND confirmado_en IS NOT NULL)
    OR (estado_validacion = 'OBSERVADO'
      AND respuesta_ciudadano = 'SIGUE_SIN_SERVICIO' AND confirmado_en IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.notificaciones_ciudadanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciudadano_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  reporte_id uuid NOT NULL
    REFERENCES public.reportes (id) ON DELETE CASCADE,
  restablecimiento_id uuid NOT NULL
    REFERENCES public.restablecimientos (id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'RESTABLECIMIENTO_PENDIENTE'
    CHECK (tipo = 'RESTABLECIMIENTO_PENDIENTE'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restablecimiento_id, ciudadano_id)
);

CREATE INDEX IF NOT EXISTS notificaciones_ciudadanas_usuario_idx
  ON public.notificaciones_ciudadanas (ciudadano_id, creado_en DESC);

-- No se exponen estas tablas directamente por PostgREST, las rutas del servidor
-- validan el token y limitan cada operación al dueño del reporte.
ALTER TABLE public.avisos_restablecimiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restablecimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_ciudadanas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avisos_restablecimiento FROM anon, authenticated;
REVOKE ALL ON public.restablecimientos FROM anon, authenticated;
REVOKE ALL ON public.notificaciones_ciudadanas FROM anon, authenticated;
