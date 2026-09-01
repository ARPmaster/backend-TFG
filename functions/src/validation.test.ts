import { describe, expect, it } from "vitest";
import { validateImageBase64, validateItemId, validateSearchValuationInput } from "./validation";

describe("validateImageBase64", () => {
  it("rechaza un payload sin imageBase64", () => {
    const result = validateImageBase64({});
    expect(result.ok).toBe(false);
  });

  it("rechaza imageBase64 que no sea string", () => {
    const result = validateImageBase64({ imageBase64: 12345 });
    expect(result.ok).toBe(false);
  });

  it("rechaza un payload que no sea un objeto", () => {
    const result = validateImageBase64("no-soy-un-objeto");
    expect(result.ok).toBe(false);
  });

  it("acepta un base64 pequeño válido", () => {
    const small = Buffer.from("una imagen pequeña de prueba").toString("base64");
    const result = validateImageBase64({ imageBase64: small });
    expect(result).toEqual({ ok: true, value: small });
  });

  it("rechaza un base64 que decodificado supera 8 MB", () => {
    // Base64 de un buffer de 9 MB: por encima del límite de 8 MB decodificados.
    const big = Buffer.alloc(9 * 1024 * 1024).toString("base64");
    const result = validateImageBase64({ imageBase64: big });
    expect(result.ok).toBe(false);
  });

  it("acepta un base64 justo por debajo del límite de 8 MB", () => {
    const justUnder = Buffer.alloc(8 * 1024 * 1024 - 1024).toString("base64");
    const result = validateImageBase64({ imageBase64: justUnder });
    expect(result.ok).toBe(true);
  });
});

describe("validateSearchValuationInput", () => {
  it("rechaza cuando falta nombre", () => {
    const result = validateSearchValuationInput({ marca: "Nike" });
    expect(result.ok).toBe(false);
  });

  it("rechaza nombre vacío tras trim", () => {
    const result = validateSearchValuationInput({ nombre: "   " });
    expect(result.ok).toBe(false);
  });

  it("rechaza marca que no sea string", () => {
    const result = validateSearchValuationInput({ nombre: "Camiseta", marca: 42 });
    expect(result.ok).toBe(false);
  });

  it("acepta nombre solo, sin marca/modelo/edición", () => {
    const result = validateSearchValuationInput({ nombre: "Balón firmado" });
    expect(result).toEqual({
      ok: true,
      value: { nombre: "Balón firmado", marca: undefined, modelo: undefined, edicion: undefined },
    });
  });

  it("acepta todos los campos cuando son strings", () => {
    const result = validateSearchValuationInput({
      nombre: "Zapatilla",
      marca: "Nike",
      modelo: "Air Force 1",
      edicion: "Retro",
    });
    expect(result).toEqual({
      ok: true,
      value: { nombre: "Zapatilla", marca: "Nike", modelo: "Air Force 1", edicion: "Retro" },
    });
  });
});

describe("validateItemId", () => {
  it("rechaza un payload sin itemId", () => {
    expect(validateItemId({}).ok).toBe(false);
  });

  it("rechaza itemId vacío", () => {
    expect(validateItemId({ itemId: "" }).ok).toBe(false);
  });

  it("acepta un itemId no vacío", () => {
    expect(validateItemId({ itemId: "abc123" })).toEqual({ ok: true, value: "abc123" });
  });
});
