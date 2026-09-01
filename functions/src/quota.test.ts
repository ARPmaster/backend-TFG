import { describe, expect, it } from "vitest";
import { DAILY_RECOGNITION_LIMIT, isOverDailyLimit, todayKey } from "./quota";

describe("isOverDailyLimit", () => {
  it("no está por encima del límite con 0 usos", () => {
    expect(isOverDailyLimit(0)).toBe(false);
  });

  it("no está por encima justo por debajo del límite", () => {
    expect(isOverDailyLimit(DAILY_RECOGNITION_LIMIT - 1)).toBe(false);
  });

  it("está por encima exactamente en el límite (el siguiente uso ya no se permite)", () => {
    expect(isOverDailyLimit(DAILY_RECOGNITION_LIMIT)).toBe(true);
  });

  it("está por encima claramente por encima del límite", () => {
    expect(isOverDailyLimit(DAILY_RECOGNITION_LIMIT + 20)).toBe(true);
  });
});

describe("todayKey", () => {
  it("formatea la fecha como yyyy-mm-dd en UTC", () => {
    const fixedDate = new Date("2026-08-24T23:59:59Z");
    expect(todayKey(fixedDate)).toBe("2026-08-24");
  });

  it("dos horas distintas del mismo día UTC dan la misma clave", () => {
    const morning = new Date("2026-08-24T01:00:00Z");
    const night = new Date("2026-08-24T22:00:00Z");
    expect(todayKey(morning)).toBe(todayKey(night));
  });
});
