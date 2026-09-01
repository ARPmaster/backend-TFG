import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import vision from "@google-cloud/vision";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Candidate, RankedCandidate, rankCandidates } from "./ranking";

admin.initializeApp();
const visionClient = new vision.ImageAnnotatorClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const recognizeItem = functions.onCall(
  // timeoutSeconds subido de 60 (default) a 120 — el log de Cloud Run mostró una invocación real
  // que tardó ~55s y murió con 500 justo al rozar el límite por defecto (2026-08-24).
  // "secrets" declarado explícito (2026-08-24) — el enlace a Secret Manager ya existía hecho a
  // mano en la consola de Cloud Run, pero no en el código; hacerlo explícito evita perderlo si
  // algún día se despliega desde cero.
  { region: "europe-west1", timeoutSeconds: 120, secrets: ["GEMINI_API_KEY"] },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Se requiere sesión iniciada");
    }

    const { imageBase64 } = request.data as { imageBase64: string };
    if (!imageBase64) {
      throw new functions.HttpsError("invalid-argument", "Falta la imagen");
    }

    logger.info("recognizeItem: entrada", { uid: request.auth.uid, imageBytes: imageBase64.length });

    // ---------- FASE 1 · Retrieval (Vision API Web Detection) ----------
    let visionResult;
    try {
      [visionResult] = await visionClient.webDetection({
        image: { content: imageBase64 },
      });
    } catch (err) {
      logger.error("recognizeItem: webDetection falló", { uid: request.auth.uid, error: (err as Error).message });
      throw new functions.HttpsError(
        "internal",
        `Vision API falló: ${(err as Error).message}`,
      );
    }
    const webDetection = visionResult.webDetection ?? {};

    const webEntities = (webDetection.webEntities ?? [])
      .filter((e) => e.description)
      .slice(0, 8)
      .map((e) => ({ descripcion: e.description, score: e.score ?? 0 }));

    const paginasConCoincidencia = (webDetection.pagesWithMatchingImages ?? [])
      .slice(0, 6)
      .map((p) => ({ titulo: p.pageTitle, url: p.url }));

    const totalFuentesRecuperadas = webEntities.length + paginasConCoincidencia.length;

    // Sin ninguna señal recuperada, no merece la pena llamar a Gemini
    if (totalFuentesRecuperadas === 0) {
      logger.info("recognizeItem: éxito, sin fuentes recuperadas", { uid: request.auth.uid, candidatos: 0 });
      return { candidates: [] as RankedCandidate[] };
    }

    const scoreVisionPromedio =
      webEntities.reduce((acc, e) => acc + e.score, 0) / (webEntities.length || 1);

    // ---------- FASE 2 · Augmented Generation (Gemini) ----------
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview", // revisar cuál es el modelo Flash vigente al implementar
      generationConfig: { responseMimeType: "application/json" },
    });

    const prompt = `
Eres un clasificador y experto en coleccionismo DEPORTIVO. Se te proporciona una imagen
de un objeto y una lista de resultados de búsqueda visual en bruto (pueden ser ruidosos
o contradictorios entre sí).

============================================================
PASO 0 — FILTRO DE ÁMBITO (obligatorio, antes que nada)
============================================================
Esta herramienta identifica EXCLUSIVAMENTE objetos relacionados con el deporte. Aplica
esta clasificación de forma estricta:

INCLUIDO (el objeto SÍ pertenece al ámbito, continúa al PASO 1):
- Equipaciones oficiales de clubes, selecciones o competiciones (camisetas, pantalones,
  chándales, medias, etc.) de marcas deportivas o licenciadas oficialmente.
- Zapatillas de cualquier tipo, siempre que sean deportivas o de marcas principalmente
  deportivas (running, baloncesto, fútbol, skate, etc.), incluidas ediciones de
  coleccionista o colaboraciones de esas marcas.
- Material y objetos de práctica deportiva en general: balones/pelotas de cualquier
  deporte, mazos de cricket, discos (frisbee, disco de hockey), palos de golf o hockey,
  raquetas, guantes de boxeo o de portero, cascos deportivos, patines, tablas de skate
  o surf, y objetos equivalentes.
- Memorabilia deportiva: cromos, balones o camisetas firmados, medallas, trofeos,
  entradas o objetos conmemorativos de eventos deportivos.

EXCLUIDO (el objeto NO pertenece al ámbito, NO continúes al PASO 1):
- Coches, motos u objetos de automoción en general (aunque tengan patrocinadores
  deportivos, lleven un escudo o sean de un piloto).
- Ropa o calzado de marcas NO deportivas o de moda genérica (Zara, H&M, marcas de moda,
  etc.), aunque el corte o estilo pueda parecerse a ropa deportiva.
- Consolas, videojuegos, tecnología y electrónica en general.
- Juguetes que no sean material deportivo real (figuras, muñecos, etc.).
- Objetos de jardín, mobiliario, menaje del hogar, o cualquier objeto cotidiano sin
  relación directa con la práctica o el coleccionismo deportivo.
- Cualquier objeto que no encaje claramente en la lista de INCLUIDOS de arriba.

Si tienes dudas razonables sobre si el objeto es deportivo o no, trátalo como EXCLUIDO.

Si el objeto está EXCLUIDO: devuelve exactamente este JSON y no hagas nada más:
{ "candidates": [] }

============================================================
PASO 1 — CONSOLIDACIÓN (solo si el objeto está INCLUIDO)
============================================================
Agrupa resultados equivalentes o duplicados entre las fuentes recuperadas y normaliza
los campos a un esquema fijo. Devuelve como máximo 5 candidatos distintos.

Resultados de búsqueda visual recuperados (JSON):
${JSON.stringify({ webEntities, paginasConCoincidencia })}

Devuelve EXCLUSIVAMENTE un JSON con este esquema, sin texto adicional ni explicaciones:
{
  "candidates": [
    {
      "nombre": string,
      "marca": string | null,
      "modelo": string | null,
      "edicion": string | null,
      "procedencia": string | null,
      "confianza": number,
      "numeroFuentes": number
    }
  ]
}
"numeroFuentes" = cuántas de las entidades/páginas recuperadas arriba mencionan o
respaldan a este candidato en concreto.
Si el objeto está incluido en el ámbito pero no hay información suficiente para ningún
candidato fiable, devuelve "candidates": [].
`.trim();

    let result;
    try {
      result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
      ]);
    } catch (err) {
      logger.error("recognizeItem: Gemini generateContent falló", { uid: request.auth.uid, error: (err as Error).message });
      throw new functions.HttpsError(
        "internal",
        `Gemini falló: ${(err as Error).message}`,
      );
    }

    let parsed: { candidates: Candidate[] };
    try {
      parsed = JSON.parse(result.response.text());
    } catch (err) {
      logger.error("recognizeItem: respuesta de Gemini no parseable", {
        uid: request.auth.uid,
        error: (err as Error).message,
        respuesta: result.response.text(),
      });
      throw new functions.HttpsError("internal", "Respuesta de Gemini no parseable");
    }

    // ---------- Ranking ponderado (calculado aquí, no es la confianza bruta de Gemini) ----------
    const candidates = rankCandidates(parsed.candidates, totalFuentesRecuperadas, scoreVisionPromedio);
    logger.info("recognizeItem: éxito", { uid: request.auth.uid, candidatos: candidates.length });
    return { candidates };
  }
);