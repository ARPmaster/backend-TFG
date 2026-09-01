/** Validación de entrada de las funciones invocables, separada en un módulo propio (sin
 * dependencias de Firebase/Vision/Gemini) para poder testearla sin inicializar ningún cliente
 * real — mismo patrón que ranking.ts y valuation.ts. Cada validador devuelve un resultado
 * discriminado en vez de lanzar HttpsError directamente: el handler decide cómo traducirlo. */

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB, ya decodificados

/** Valida el payload de recognizeItem: debe traer imageBase64 como string no vacío, y su tamaño
 * decodificado no puede superar MAX_IMAGE_BYTES (evita que un payload gigante se cuele hasta
 * Vision/Gemini y dispare coste o timeout innecesarios). */
export function validateImageBase64(data: unknown): ValidationResult<string> {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Falta la imagen" };
  }
  const imageBase64 = (data as Record<string, unknown>).imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return { ok: false, message: "Falta la imagen" };
  }
  const decodedBytes = Buffer.byteLength(imageBase64, "base64");
  if (decodedBytes > MAX_IMAGE_BYTES) {
    return { ok: false, message: "La imagen supera el tamaño máximo permitido (8 MB)" };
  }
  return { ok: true, value: imageBase64 };
}

export interface SearchValuationInput {
  nombre: string;
  marca?: string;
  modelo?: string;
  edicion?: string;
}

/** Valida el payload de searchValuation: nombre es obligatorio y, si vienen, marca/modelo/edicion
 * deben ser strings (no basta con que buildSearchKey tolere ausencias — un tipo incorrecto no
 * debe colarse silenciosamente hasta la búsqueda). */
export function validateSearchValuationInput(data: unknown): ValidationResult<SearchValuationInput> {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Faltan datos para buscar el precio" };
  }
  const record = data as Record<string, unknown>;
  const nombre = record.nombre;
  if (typeof nombre !== "string" || nombre.trim().length === 0) {
    return { ok: false, message: "Faltan datos para buscar el precio" };
  }
  for (const field of ["marca", "modelo", "edicion"] as const) {
    const value = record[field];
    if (value !== undefined && typeof value !== "string") {
      return { ok: false, message: `El campo "${field}" no es válido` };
    }
  }
  return {
    ok: true,
    value: {
      nombre,
      marca: record.marca as string | undefined,
      modelo: record.modelo as string | undefined,
      edicion: record.edicion as string | undefined,
    },
  };
}

/** Valida el payload de refreshValuation: itemId obligatorio y de tipo string. */
export function validateItemId(data: unknown): ValidationResult<string> {
  if (typeof data !== "object" || data === null) {
    return { ok: false, message: "Falta itemId" };
  }
  const itemId = (data as Record<string, unknown>).itemId;
  if (typeof itemId !== "string" || itemId.length === 0) {
    return { ok: false, message: "Falta itemId" };
  }
  return { ok: true, value: itemId };
}
