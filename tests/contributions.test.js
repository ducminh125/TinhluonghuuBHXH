import test from "node:test";
import assert from "node:assert/strict";
import { calculateAverageBase, expandContributionPeriods } from "../js/contributions.js";

const closeTo = (actual, expected, epsilon = 0.5) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test("period expansion is inclusive and catches overlapping months", () => {
  const expanded = expandContributionPeriods([
    { from: "2024-01", to: "2024-03", regime: "employer", valueType: "vnd", amountVnd: 10000000 },
    { from: "2024-03", to: "2024-04", regime: "employer", valueType: "vnd", amountVnd: 12000000 }
  ], "2026-05");
  assert.equal(expanded.months.length, 4);
  assert.ok(expanded.errors.some(e => e.includes("03/2024")));
});

test("employer salary uses 2026 wage adjustment factor", () => {
  const result = calculateAverageBase([
    { from: "2024-01", to: "2024-12", regime: "employer", valueType: "vnd", amountVnd: 10000000 }
  ], { retirementMonth: "2026-05" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 10300000);
  assert.equal(result.totalMonths, 12);
});

test("pre-2016 state coefficient is adjusted by reference level at pension time", () => {
  const result = calculateAverageBase([
    { from: "2010-01", to: "2010-12", regime: "state", valueType: "coefficient", coefficient: 3 }
  ], { retirementMonth: "2026-05" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 3 * 2340000);
  assert.equal(result.stateWindow.prescribedMonths, 120);
});

test("post-2016 state coefficient is converted using historical base salary then adjusted", () => {
  const result = calculateAverageBase([
    { from: "2024-07", to: "2024-07", regime: "state", valueType: "coefficient", coefficient: 3 }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 3 * 2340000 * 1.03);
});

test("mixed state and employer history uses state average plus employer adjusted sum", () => {
  const result = calculateAverageBase([
    { from: "2024-07", to: "2024-07", regime: "state", valueType: "coefficient", coefficient: 3 },
    { from: "2025-01", to: "2025-01", regime: "employer", valueType: "vnd", amountVnd: 10000000 }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  const state = 3 * 2340000 * 1.03;
  closeTo(result.compulsoryAverage, (state + 10000000) / 2);
  closeTo(result.averageBase, (state + 10000000) / 2);
});

test("voluntary history is combined into final average base", () => {
  const result = calculateAverageBase([
    { from: "2024-01", to: "2024-01", regime: "employer", valueType: "vnd", amountVnd: 10000000 },
    { from: "2025-01", to: "2025-01", regime: "voluntary", valueType: "vnd", amountVnd: 5000000 }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, (10300000 + 5000000) / 2);
  assert.equal(result.compulsoryMonths, 1);
  assert.equal(result.voluntaryMonths, 1);
});

test("future pension year is marked provisional instead of inventing future factors", () => {
  const result = calculateAverageBase([
    { from: "2026-01", to: "2026-12", regime: "employer", valueType: "vnd", amountVnd: 12000000 }
  ], { retirementMonth: "2027-04" });
  assert.equal(result.ok, true);
  assert.equal(result.provisional, true);
  assert.ok(result.warnings.some(w => w.includes("tạm")));
});
