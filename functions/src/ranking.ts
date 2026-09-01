/** Lógica de ranking de candidatos de recognizeItem, separada en un módulo propio (sin
 * dependencias de Firebase/Vision/Gemini) para que se pueda testear sin inicializar ningún
 * cliente real. */

export interface Candidate {
  nombre: string;
  marca: string | null;
  modelo: string | null;
  edicion: string | null;
  procedencia: string | null;
  confianza: number; // 0.0 a 1.0, reportado por Gemini
  numeroFuentes: number; // cuántas páginas/entidades recuperadas respaldan este candidato
}

export interface RankedCandidate extends Candidate {
  score: number; // calculado aquí, no es la confianza bruta de Gemini
}

/**
 * Ordena y limita a 5 los candidatos consolidados por Gemini, combinando tres señales: la
 * fiabilidad media de la búsqueda visual (scoreVisionPromedio), cuántas de las fuentes
 * recuperadas respaldan a este candidato en concreto (consenso, acotado a 1) y la confianza que
 * Gemini le asignó. Nunca lanza: candidatos vacíos devuelven un array vacío, y un candidato sin
 * `confianza` se trata como 0.
 */
export function rankCandidates(
  candidates: Candidate[],
  totalFuentesRecuperadas: number,
  scoreVisionPromedio: number,
): RankedCandidate[] {
  const ranked: RankedCandidate[] = candidates.map((c) => {
    const consenso = totalFuentesRecuperadas > 0
      ? Math.min(c.numeroFuentes / totalFuentesRecuperadas, 1)
      : 0;
    const score =
      0.4 * scoreVisionPromedio +
      0.35 * consenso +
      0.25 * (c.confianza ?? 0);
    return { ...c, score };
  });

  ranked.sort((a, b) => b.score - a.score);

  return ranked.slice(0, 5);
}
