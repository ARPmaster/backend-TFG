/** Regla de cuota diaria de recognizeItem por usuario, separada del acceso a Firestore (que vive
 * en recognizeItem.ts) para poder testear el umbral sin emulador. El contador real se guarda en
 * `usage/{uid}/daily/{yyyy-mm-dd}` e incrementa con FieldValue.increment (atómico). */

export const DAILY_RECOGNITION_LIMIT = 50;

export function isOverDailyLimit(currentCount: number): boolean {
  return currentCount >= DAILY_RECOGNITION_LIMIT;
}

/** Clave del documento de contador del día, en la zona horaria UTC del servidor — coherente entre
 * invocaciones, que es lo único que importa para un límite "por día" aproximado. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10); // yyyy-mm-dd
}
