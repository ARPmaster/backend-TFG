import { describe, expect, it } from "vitest";
import { buildSearchKey, extractGroundingSources, normalizeKey, parseValuationJson } from "./valuation";

describe("normalizeKey", () => {
  it("ordena las palabras alfabéticamente y las une con _", () => {
    expect(normalizeKey("Nike Air Force")).toBe("air_force_nike");
  });

  it("dos frases con las mismas palabras en distinto orden dan la misma clave", () => {
    expect(normalizeKey("Nike Air Jordan 1")).toBe(normalizeKey("Air Jordan 1 Nike"));
  });

  it("quita puntuación y normaliza mayúsculas", () => {
    expect(normalizeKey("Adidas, Superstar!")).toBe("adidas_superstar");
  });
});

describe("buildSearchKey", () => {
  it("usa marca+modelo+edición para la cacheKey cuando están presentes", () => {
    const { cacheKey } = buildSearchKey("Zapatilla cualquiera", "Nike", "Air Force 1", "Retro");
    expect(cacheKey).toBe(normalizeKey("Nike Air Force 1 Retro"));
  });

  it("cae al nombre libre si marca/modelo/edición están vacíos (item creado a mano)", () => {
    const { cacheKey } = buildSearchKey("Balón de fútbol firmado", null, null, null);
    expect(cacheKey).toBe(normalizeKey("Balón de fútbol firmado"));
  });

  it("la searchQuery concatena solo los campos presentes, sin huecos", () => {
    const { searchQuery } = buildSearchKey("Camiseta", "Nike", undefined, undefined);
    expect(searchQuery).toBe("Camiseta Nike");
  });

  it("dos productos iguales escritos distinto comparten cacheKey", () => {
    const a = buildSearchKey("", "Nike", "Air Force 1", null);
    const b = buildSearchKey("", "Air Force 1", "Nike", null);
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});

describe("parseValuationJson", () => {
  it("parsea un JSON normal", () => {
    const result = parseValuationJson('{"precio":100,"min":90,"max":110,"moneda":"EUR"}');
    expect(result).toEqual({ precio: 100, min: 90, max: 110, moneda: "EUR" });
  });

  it("quita las fences de markdown si Gemini las añade", () => {
    const raw = '```json\n{"precio":50,"min":null,"max":null,"moneda":"EUR"}\n```';
    expect(parseValuationJson(raw)).toEqual({ precio: 50, min: null, max: null, moneda: "EUR" });
  });

  it("usa EUR por defecto si falta moneda", () => {
    const result = parseValuationJson('{"precio":null,"min":null,"max":null}');
    expect(result.moneda).toBe("EUR");
  });

  it("normaliza precio/min/max ausentes a null en vez de undefined (campos que faltan)", () => {
    const result = parseValuationJson("{}");
    expect(result).toEqual({ precio: null, min: null, max: null, moneda: "EUR" });
  });

  it("lanza si el texto no es JSON válido (respuesta de Gemini malformada)", () => {
    expect(() => parseValuationJson("no es json")).toThrow();
  });
});

describe("extractGroundingSources", () => {
  it("extrae label y url de los chips y decodifica entidades HTML", () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            searchEntryPoint: {
              renderedContent:
                '<a class="chip" href="https://www.google.com/search?q=a&amp;b">Nike &#39;Air Force&#39;</a>',
            },
          },
        },
      ],
    };
    expect(extractGroundingSources(response)).toEqual([
      { url: "https://www.google.com/search?q=a&b", label: "Nike 'Air Force'" },
    ]);
  });

  it("devuelve un array vacío si no hay groundingMetadata", () => {
    expect(extractGroundingSources({ candidates: [{}] })).toEqual([]);
  });

  it("devuelve un array vacío en vez de lanzar ante una respuesta con forma inesperada", () => {
    expect(extractGroundingSources(null)).toEqual([]);
    expect(extractGroundingSources(undefined)).toEqual([]);
    expect(extractGroundingSources("cualquier cosa")).toEqual([]);
    expect(extractGroundingSources({ candidates: "no es un array" })).toEqual([]);
  });
});
