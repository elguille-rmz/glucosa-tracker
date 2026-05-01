import Dexie from "dexie";

/**
 * Base de datos local usando Dexie.js (wrapper de IndexedDB).
 *
 * Tabla: registros
 *   id        – clave primaria (timestamp numérico, Date.now())
 *   fecha     – string "YYYY-MM-DDTHH:mm" en UTC-6, índice secundario
 *   valor     – número mg/dL, índice secundario
 *   contexto  – string (Ayunas, Pre-comida, etc.)
 *
 * Los índices sobre fecha y valor permiten consultas ordenadas
 * y filtros eficientes (p. ej. rangos de fecha o valor).
 */
export const db = new Dexie("glucosa_db");

db.version(1).stores({
  registros: "id, fecha, valor, contexto",
});
