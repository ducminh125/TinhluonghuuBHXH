import test from "node:test";
import assert from "node:assert/strict";
import {
  basePensionRate,
  earlyRetirementReduction,
  roundContributionYears,
  statutoryRetirementAttainmentMonth,
  retirementAttainmentMonth,
  pensionStartMonthFromStatutoryMonth,
  calculatePension
} from "../js/pension.js";

test("rounding contribution months follows statutory half-year/full-year rule", () => {
  assert.equal(roundContributionYears(20 * 12), 20);
  assert.equal(roundContributionYears(20 * 12 + 1), 20.5);
  assert.equal(roundContributionYears(20 * 12 + 6), 20.5);
  assert.equal(roundContributionYears(20 * 12 + 7), 21);
  assert.equal(roundContributionYears(20 * 12 + 11), 21);
});

test("female pension rate", () => {
  assert.equal(basePensionRate("female", 15 * 12), 45);
  assert.equal(basePensionRate("female", 15 * 12 + 6), 46);
  assert.equal(basePensionRate("female", 30 * 12), 75);
});

test("male pension rate", () => {
  assert.equal(basePensionRate("male", 15 * 12), 40);
  assert.equal(basePensionRate("male", 19 * 12 + 6), 44.5);
  assert.equal(basePensionRate("male", 20 * 12), 45);
  assert.equal(basePensionRate("male", 35 * 12), 75);
});

test("early retirement reduction", () => {
  assert.equal(earlyRetirementReduction(5), 0);
  assert.equal(earlyRetirementReduction(6), 1);
  assert.equal(earlyRetirementReduction(11), 1);
  assert.equal(earlyRetirementReduction(12), 2);
  assert.equal(earlyRetirementReduction(18), 3);
});

test("retirement month follows Decree 135 schedule examples", () => {
  assert.equal(statutoryRetirementAttainmentMonth("1964-10-10", "male"), "2026-04");
  assert.equal(pensionStartMonthFromStatutoryMonth("2026-04"), "2026-05");
  assert.equal(statutoryRetirementAttainmentMonth("1965-07-01", "male"), "2027-04");
  assert.equal(statutoryRetirementAttainmentMonth("1969-05-20", "female"), "2026-05");
});

test("minimum retirement age uses its own Decree 135 schedule", () => {
  assert.equal(retirementAttainmentMonth("1969-10-10", "male", 5), "2026-04");
  assert.notEqual(retirementAttainmentMonth("1969-10-10", "male", 5), "2026-10");
});

test("basic pension calculation accepts totals from contribution-history engine", () => {
  const result = calculatePension({
    sex: "female",
    birthDate: "1969-05-20",
    retirementMonth: "2026-05",
    totalMonths: 25 * 12,
    compulsoryMonths: 25 * 12,
    firstCompulsoryYm: "2001-01",
    averageBase: 10000000,
    retirementCase: "normal",
    specialMonthsTotal: 0,
    impairmentPercent: 0,
    minimumFloorEligible: false
  });
  assert.equal(result.eligible, true);
  assert.equal(result.finalRate, 65);
  assert.equal(result.monthlyPension, 6500000);
});

test("reference-level floor requires selected transition group, pre-July-2025 participation and 20y compulsory", () => {
  const result = calculatePension({
    sex: "male",
    birthDate: "1964-10-10",
    retirementMonth: "2026-07",
    totalMonths: 20 * 12,
    compulsoryMonths: 20 * 12,
    firstCompulsoryYm: "2006-01",
    averageBase: 4000000,
    retirementCase: "normal",
    specialMonthsTotal: 0,
    impairmentPercent: 0,
    minimumFloorEligible: true
  });
  assert.equal(result.rawMonthly, 1800000);
  assert.equal(result.referenceLevel, 2530000);
  assert.equal(result.monthlyPension, 2530000);
});
