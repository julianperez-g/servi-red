/**
 * postgres.js no es compatible con attachDatabasePool. Al acabar las peticiones
 * concurrentes, close() libera conexiones sin destruir el pool: las siguientes
 * pueden reconectar. waitUntil permite completar el cierre tras la respuesta.
 */
export function crearHandlerVercel({ sql, handler, waitUntil, logError = console.error }) {
  let activas = 0;
  return async (request, response) => {
    activas++;
    try {
      await handler(request, response);
    } finally {
      activas--;
      if (activas === 0) {
        waitUntil(sql.close().catch(() => {
          logError("No se pudieron cerrar las conexiones de indicadores.");
        }));
      }
    }
  };
}
