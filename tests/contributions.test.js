import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectedPeriods,
  calculateAverageBase,
  dedupeImportedPeriods,
  expandContributionPeriods,
  stateContributionCoefficient
} from "../js/contributions.js";

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
  assert.ok(result.warnings.some(w => w.includes("chưa có đầy đủ")));
});

test("state contribution coefficient includes eligible state allowances", () => {
  const row = {
    regime: "state",
    valueType: "coefficient",
    coefficient: 4,
    positionAllowanceCoeff: 0.5,
    seniorityBeyondPercent: 5,
    professionalSeniorityPercent: 10,
    reservedDifferenceCoeff: 0.2
  };
  // TNVK = 4 * 5% = .2; thâm niên nghề = (4 + .5 + .2) * 10% = .47.
  closeTo(stateContributionCoefficient(row), 5.37, 0.00001);

  const result = calculateAverageBase([
    { ...row, from: "2024-07", to: "2024-07" }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 5.37 * 2340000 * 1.03);
});

test("state VND input can add separately stated contribution allowance", () => {
  const result = calculateAverageBase([
    {
      from: "2024-07",
      to: "2024-07",
      regime: "state",
      valueType: "vnd",
      amountVnd: 9000000,
      allowanceVnd: 1000000
    }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 10000000 * 1.03);
});

test("employer allowance included in contribution base before averaging", () => {
  const result = calculateAverageBase([
    {
      from: "2024-01",
      to: "2024-01",
      regime: "employer",
      valueType: "vnd",
      amountVnd: 10000000,
      allowanceVnd: 2000000
    }
  ], { retirementMonth: "2026-07" });
  assert.equal(result.ok, true);
  closeTo(result.averageBase, 12000000 * 1.03);
});

test("multi-image import removes exact overlapping months and compacts them", () => {
  const merged = dedupeImportedPeriods([
    { from: "2024-01", to: "2024-06", regime: "employer", valueType: "vnd", amountVnd: 10000000 },
    { from: "2024-05", to: "2024-12", regime: "employer", valueType: "vnd", amountVnd: 10000000 }
  ]);
  assert.equal(merged.conflicts, 0);
  assert.equal(merged.duplicatesRemoved, 2);
  assert.equal(merged.periods.length, 1);
  assert.equal(merged.periods[0].from, "2024-01");
  assert.equal(merged.periods[0].to, "2024-12");
});

test("multi-image import warns on conflicting overlap and keeps first value", () => {
  const merged = dedupeImportedPeriods([
    { from: "2024-05", to: "2024-05", regime: "employer", valueType: "vnd", amountVnd: 10000000 },
    { from: "2024-05", to: "2024-05", regime: "employer", valueType: "vnd", amountVnd: 12000000 }
  ]);
  assert.equal(merged.conflicts, 1);
  assert.equal(merged.periods.length, 1);
  assert.equal(merged.periods[0].amountVnd, 10000000);
  assert.ok(merged.warnings.some(w => w.includes("05/2024")));
});

test("VND projection holds current salary through retirement month", () => {
  const projection = buildProjectedPeriods([
    { from: "2026-01", to: "2026-06", regime: "employer", valueType: "vnd", amountVnd: 12000000, allowanceVnd: 1500000 }
  ], "2026-09");
  assert.equal(projection.monthsAdded, 3);
  assert.equal(projection.periods.length, 1);
  assert.equal(projection.periods[0].from, "2026-07");
  assert.equal(projection.periods[0].to, "2026-09");
  assert.equal(projection.periods[0].amountVnd, 12000000);
  assert.equal(projection.periods[0].allowanceVnd, 1500000);
  assert.equal(projection.periods[0].projected, true);
});

test("coefficient projection applies configured regular grade raises", () => {
  const projection = buildProjectedPeriods([
    { from: "2024-07", to: "2026-06", regime: "state", valueType: "coefficient", coefficient: 4 }
  ], "2028-08", {
    gradeStartMonth: "2024-07",
    raiseCadenceMonths: 24,
    coefficientStep: 0.33,
    maxCoefficient: 9
  });
  assert.equal(projection.monthsAdded, 26);
  assert.equal(projection.periods.length, 2);
  assert.equal(projection.periods[0].from, "2026-07");
  assert.equal(projection.periods[0].to, "2028-06");
  closeTo(projection.periods[0].coefficient, 4.33, 0.00001);
  assert.equal(projection.periods[1].from, "2028-07");
  assert.equal(projection.periods[1].to, "2028-08");
  closeTo(projection.periods[1].coefficient, 4.66, 0.00001);
});
