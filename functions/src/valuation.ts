/** Lógica pura de valoración (claves de búsqueda/caché, parseo de la respuesta de Gemini,
 * extracción de fuentes de grounding), separada en un módulo propio sin dependencias de
 * Firebase/Gemini para que se pueda testear sin inicializar ningún cliente real. */

/** Una búsqueda que Gemini ejecutó de verdad para llegar al precio — NO es un enlace directo al
 * anuncio de eBay/Vinted que miró (esta API no expone eso, ver `extractGroundingSources`), es un
 * enlace de búsqueda de Google con la misma query. Sigue siendo verificable (el usuario puede ver
 * resultados comparables), pero no es "aquí está la fuente exacta". */
export interface GroundingSource {
  label: string;
  url: string;
}

export interface ValuationResult {
  precio: number | null;
  min: number | null;
  max: number | null;
  moneda: string;
  fuentes: GroundingSource[];
}

/** Misma clave para "el mismo producto" en toda la app: marca+modelo+edición normalizados (cae al
 * nombre libre completo si esos campos están vacíos, caso de un item creado a mano). Usada tanto
 * por [refreshValuation] (item ya guardado) como por [searchValuation] (2026-08-24, antes de que
 * el item exista) — así ambas rutas comparten el mismo `products_cache`, sea cual sea el uid que
 * pregunte. 2026-08-24: encontrado en pruebas reales — la misma zapatilla subida dos veces con el
 * nombre escrito distinto daba precios distintos porque nunca coincidía con la clave anterior. */
export function buildSearchKey(
  nombre: string,
  marca?: string | null,
  modelo?: string | null,
  edicion?: string | null
): { searchQuery: string; cacheKey: string } {
  const searchQuery = [nombre, marca, modelo, edicion]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(" ");
  const structuredKey = [marca, modelo, edicion]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join(" ");
  return { searchQuery, cacheKey: normalizeKey(structuredKey || nombre) };
}

/** Ordena las palabras alfabéticamente antes de unirlas — así "Nike Air Jordan 1" y "Air Jordan 1
 * Nike" caen en la misma clave. Sigue sin ser matching semántico: dos descripciones con palabras
 * realmente distintas (sinónimos, datos que faltan en una de las dos) seguirán sin coincidir —
 * eso necesitaría embeddings/búsqueda difusa, fuera de alcance para esta entrega. */
export function normalizeKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .sort()
    .join("_")
    .slice(0, 200);
}

/** Parsea el JSON que devuelve Gemini (quitando fences de markdown si los añade) y aplica los
 * valores por defecto: moneda "EUR" si no viene, precio/min/max se dejan en null si Gemini no
 * encontró nada fiable (nunca se inventa un número). Lanza si el texto no es JSON válido: quien
 * llama decide cómo traducir eso a un error de usuario. */
export function parseValuationJson(rawText: string): {
  precio: number | null;
  min: number | null;
  max: number | null;
  moneda: string;
} {
  const parsed = JSON.parse(stripMarkdownFences(rawText));
  return {
    precio: parsed.precio ?? null,
    min: parsed.min ?? null,
    max: parsed.max ?? null,
    moneda: parsed.moneda || "EUR",
  };
}

export function stripMarkdownFences(text: string): string {
  return text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
}

/**
 * 2026-08-24: confirmado con una respuesta real (logs de producción) que esta API/versión del SDK
 * NO devuelve `groundingChunks` (el campo que se había supuesto originalmente, sin verificar) — el
 * único rastro de qué buscó Gemini está en `groundingMetadata.searchEntryPoint.renderedContent`,
 * un bloque HTML con enlaces `<a class="chip" href="https://www.google.com/search?q=...">texto</a>`.
 * Son enlaces de búsqueda de Google con la misma query, NO la URL del anuncio concreto que Gemini
 * leyó — no hay forma de conseguir eso con esta API tal como está expuesta hoy. Se parsean con
 * regex en vez de un DOM parser (no hay ninguno en el proyecto, y es HTML simple y controlado por
 * Google, no contenido arbitrario de usuario).
 */
export function extractGroundingSources(response: unknown): GroundingSource[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = (response as any)?.candidates?.[0];
    const html = candidate?.groundingMetadata?.searchEntryPoint?.renderedContent as string | undefined;
    if (!html) return [];
    const matches = [...html.matchAll(/<a class="chip" href="([^"]+)">([^<]*)<\/a>/g)];
    return matches.map((m) => ({ url: decodeHtmlEntities(m[1]), label: decodeHtmlEntities(m[2]) }));
  } catch (err) {
    console.error("extractGroundingSources: no se pudo extraer groundingMetadata", err);
    return [];
  }
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
