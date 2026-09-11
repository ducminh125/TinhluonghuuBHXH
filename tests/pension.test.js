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

test("rounding contribution months follows Article 5(6)", () => {
  assert.equal(roundContributionYears(20 * 12 + 0), 20);
  assert.equal(roundContributionYears(20 * 12 + 1), 20.5);
  assert.equal(roundContributionYears(20 * 12 + 6), 20.5);
  assert.equal(roundContributionYears(20 * 12 + 7), 21);
  assert.equal(roundContributionYears(20 * 12 + 11), 21);
});

test("female pension rate", () => {
  assert.equal(basePensionRate("female", 15 * 12), 45);
  assert.equal(basePensionRate("female", 15 * 12 + 6), 46);
  assert.equal(basePensionRate("female", 30 * 12), 75);
  assert.equal(basePensionRate("female", 35 * 12), 75);
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
  assert.equal(earlyRetirementReduction(24), 4);
});

test("retirement month follows Decree 135 schedule examples", () => {
  // Nam sinh 10/1964: đủ 61 tuổi 6 tháng trong 04/2026, hưởng từ 05/2026.
  assert.equal(statutoryRetirementAttainmentMonth("1964-10-10", "male"), "2026-04");
  assert.equal(pensionStartMonthFromStatutoryMonth("2026-04"), "2026-05");

  // Nam sinh 07/1965: đủ 61 tuổi 9 tháng trong 04/2027, hưởng từ 05/2027.
  assert.equal(statutoryRetirementAttainmentMonth("1965-07-01", "male"), "2027-04");

  // Nữ sinh 05/1969: đủ 57 tuổi trong 05/2026, hưởng từ 06/2026.
  assert.equal(statutoryRetirementAttainmentMonth("1969-05-20", "female"), "2026-05");
});

test("minimum retirement age uses its own Decree 135 schedule", () => {
  // Phụ lục II: nam sinh 10/1969 đạt tuổi thấp nhất 56 tuổi 6 tháng trong 04/2026.
  assert.equal(retirementAttainmentMonth("1969-10-10", "male", 5), "2026-04");
  // Không được tính bằng tháng nghỉ hưu thông thường rồi trừ cơ học 60 tháng.
  assert.notEqual(retirementAttainmentMonth("1969-10-10", "male", 5), "2026-10");
});

test("basic pension calculation", () => {
  const result = calculatePension({
    insuranceType: "compulsory",
    sex: "female",
    birthDate: "1969-05-20",
    retirementMonth: "2026-05",
    contributionYears: 25,
    contributionMonths: 0,
    averageBase: 10000000,
    retirementCase: "normal",
    specialYears: 0,
    specialMonths: 0,
    impairmentPercent: 0,
    minimumFloorEligible: false
  });
  assert.equal(result.eligible, true);
  assert.equal(result.finalRate, 65);
  assert.equal(result.monthlyPension, 6500000);
});

test("minimum reference-level floor can be applied when explicitly selected", () => {
  const result = calculatePension({
    insuranceType: "compulsory",
    sex: "male",
    birthDate: "1964-10-10",
    retirementMonth: "2026-07",
    contributionYears: 20,
    contributionMonths: 0,
    averageBase: 4000000,
    retirementCase: "normal",
    specialYears: 0,
    specialMonths: 0,
    impairmentPercent: 0,
    minimumFloorEligible: true
  });
  assert.equal(result.rawMonthly, 1800000);
  assert.equal(result.referenceLevel, 2530000);
  assert.equal(result.monthlyPension, 2530000);
});
