import { describe, expect, it } from "vitest";
import { Candidate, rankCandidates } from "./ranking";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    nombre: "Nike Air Force 1",
    marca: "Nike",
    modelo: "Air Force 1",
    edicion: null,
    procedencia: null,
    confianza: 0.8,
    numeroFuentes: 2,
    ...overrides,
  };
}

describe("rankCandidates", () => {
  it("devuelve un array vacío si no hay candidatos (p. ej. objeto fuera de ámbito)", () => {
    expect(rankCandidates([], 5, 0.5)).toEqual([]);
  });

  it("calcula el score como 0.4*visión + 0.35*consenso + 0.25*confianza", () => {
    // totalFuentesRecuperadas=4, numeroFuentes=2 -> consenso=0.5
    const [ranked] = rankCandidates([candidate({ numeroFuentes: 2, confianza: 0.8 })], 4, 0.6);
    const expected = 0.4 * 0.6 + 0.35 * 0.5 + 0.25 * 0.8;
    expect(ranked.score).toBeCloseTo(expected, 10);
  });

  it("acota el consenso a 1 aunque numeroFuentes supere el total recuperado", () => {
    // Respuesta de Gemini inconsistente: numeroFuentes (9) > totalFuentesRecuperadas (3).
    // Sin el tope, consenso sería 9/3=3 y el score superaría 1; con el tope, consenso=1.
    const [ranked] = rankCandidates([candidate({ numeroFuentes: 9, confianza: 0.8 })], 3, 0);
    expect(ranked.score).toBeCloseTo(0.35 * 1 + 0.25 * 0.8, 10);
  });

  it("trata confianza ausente/undefined como 0 en vez de lanzar (respuesta malformada)", () => {
    const malformed = candidate({ confianza: undefined as unknown as number });
    expect(() => rankCandidates([malformed], 2, 0.5)).not.toThrow();
    const [ranked] = rankCandidates([malformed], 2, 0.5);
    expect(ranked.score).toBeCloseTo(0.4 * 0.5 + 0.35 * (malformed.numeroFuentes / 2), 10);
  });

  it("no lanza división por cero cuando totalFuentesRecuperadas es 0", () => {
    expect(() => rankCandidates([candidate()], 0, 0)).not.toThrow();
    const [ranked] = rankCandidates([candidate()], 0, 0);
    expect(ranked.score).toBeCloseTo(0.25 * candidate().confianza, 10);
  });

  it("ordena de mayor a menor score", () => {
    const bajo = candidate({ nombre: "bajo", numeroFuentes: 0, confianza: 0.1 });
    const alto = candidate({ nombre: "alto", numeroFuentes: 4, confianza: 0.9 });
    const ranked = rankCandidates([bajo, alto], 4, 0.5);
    expect(ranked.map((c) => c.nombre)).toEqual(["alto", "bajo"]);
  });

  it("empate de score conserva el orden original (sort estable)", () => {
    const a = candidate({ nombre: "a" });
    const b = candidate({ nombre: "b" });
    const ranked = rankCandidates([a, b], 4, 0.5);
    expect(ranked.map((c) => c.nombre)).toEqual(["a", "b"]);
  });

  it("recorta a un máximo de 5 candidatos", () => {
    const seis = Array.from({ length: 6 }, (_, i) =>
      candidate({ nombre: `candidato-${i}`, confianza: i / 10 }));
    const ranked = rankCandidates(seis, 6, 0.5);
    expect(ranked).toHaveLength(5);
    // Se quedan los 5 de mayor confianza (candidato-5 .. candidato-1), no los primeros del array.
    expect(ranked.map((c) => c.nombre)).toEqual([
      "candidato-5",
      "candidato-4",
      "candidato-3",
      "candidato-2",
      "candidato-1",
    ]);
  });

  it("conserva el resto de campos del candidato sin modificarlos", () => {
    const original = candidate({ marca: "Adidas", edicion: "Retro" });
    const [ranked] = rankCandidates([original], 2, 0.5);
    expect(ranked.marca).toBe("Adidas");
    expect(ranked.edicion).toBe("Retro");
  });
});
