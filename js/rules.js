export const LAW_META = {
  law: "Luật Bảo hiểm xã hội số 41/2024/QH15",
  effectiveFrom: "2025-07-01",
  decree: "Nghị định 158/2025/NĐ-CP",
  retirementDecree: "Nghị định 135/2020/NĐ-CP",
  updatedAt: "2026-09-11"
};

export const REFERENCE_LEVELS = [
  { from: "2024-07", amount: 2340000 },
  { from: "2026-07", amount: 2530000 }
];

export function normalRetirementAgeMonthsForYear(sex, year) {
  if (sex === "male") {
    if (year < 2021) return 60 * 12;
    return Math.min(62 * 12, 60 * 12 + 3 * (year - 2020));
  }

  if (year < 2021) return 55 * 12;
  return Math.min(60 * 12, 55 * 12 + 4 * (year - 2020));
}

export function formatAgeMonths(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
}

export function referenceLevelForMonth(yyyyMm) {
  let value = REFERENCE_LEVELS[0].amount;
  for (const row of REFERENCE_LEVELS) {
    if (yyyyMm >= row.from) value = row.amount;
  }
  return value;
}
