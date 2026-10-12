import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedBusinessDate, isCalendarDate, wibDateKey } from "./business-date";

test("validates YYYY-MM-DD with calendar round-trip rules", () => {
  assert.equal(isCalendarDate("2024-02-29"), true);
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-2-01"), false);
  assert.equal(isCalendarDate("2026-02-01T00:00:00Z"), false);
  assert.equal(isCalendarDate(new Date("2026-02-01")), false);
});

test("uses the WIB calendar day at UTC boundaries", () => {
  const beforeWibMidnight = new Date("2026-10-11T16:59:59.999Z");
  const afterWibMidnight = new Date("2026-10-11T17:00:00.000Z");
  assert.equal(wibDateKey(beforeWibMidnight), "2026-10-11");
  assert.equal(wibDateKey(afterWibMidnight), "2026-10-12");
  assert.equal(isAllowedBusinessDate("2026-10-12", beforeWibMidnight), false);
  assert.equal(isAllowedBusinessDate("2026-10-12", afterWibMidnight), true);
  assert.equal(isAllowedBusinessDate("2020-01-01", afterWibMidnight), true);
});
