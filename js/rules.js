export const LAW_META = {
  law: "Luật Bảo hiểm xã hội số 41/2024/QH15",
  effectiveFrom: "2025-07-01",
  decree: "Nghị định 158/2025/NĐ-CP",
  circular: "Thông tư 12/2025/TT-BNV",
  retirementDecree: "Nghị định 135/2020/NĐ-CP",
  updatedAt: "2026-09-11"
};

// Mức tham chiếu hiện hành. Khi chưa bãi bỏ mức lương cơ sở, mức tham chiếu
// bằng mức lương cơ sở. Các mốc tương lai phải được cập nhật khi có văn bản mới.
export const REFERENCE_LEVELS = [
  { from: "2024-07", amount: 2340000 },
  { from: "2026-07", amount: 2530000 }
];

// Mức lương cơ sở dùng để quy đổi trường hợp lương Nhà nước nhập bằng hệ số.
// Bản v2 có các mốc lịch sử phổ biến từ 1998. Hồ sơ cũ hơn nên nhập hệ số thay vì VND.
export const BASE_SALARY_LEVELS = [
  { from: "1998-01", amount: 144000 },
  { from: "2000-01", amount: 180000 },
  { from: "2001-01", amount: 210000 },
  { from: "2003-01", amount: 290000 },
  { from: "2005-10", amount: 350000 },
  { from: "2006-10", amount: 450000 },
  { from: "2008-01", amount: 540000 },
  { from: "2009-05", amount: 650000 },
  { from: "2010-05", amount: 730000 },
  { from: "2011-05", amount: 830000 },
  { from: "2012-05", amount: 1050000 },
  { from: "2013-07", amount: 1150000 },
  { from: "2016-05", amount: 1210000 },
  { from: "2017-07", amount: 1300000 },
  { from: "2018-07", amount: 1390000 },
  { from: "2019-07", amount: 1490000 },
  { from: "2023-07", amount: 1800000 },
  { from: "2024-07", amount: 2340000 },
  { from: "2026-07", amount: 2530000 }
];

// Hệ số điều chỉnh tiền lương/thu nhập đã đóng BHXH theo năm hưởng 2025.
// Nguồn: Thông tư 01/2025/TT-BLĐTBXH.
export const ADJUSTMENT_FACTORS_2025 = {
  before1995: 5.63,
  1995: 4.78, 1996: 4.51, 1997: 4.37, 1998: 4.06, 1999: 3.89,
  2000: 3.95, 2001: 3.97, 2002: 3.82, 2003: 3.70, 2004: 3.43,
  2005: 3.17, 2006: 2.95, 2007: 2.72, 2008: 2.21, 2009: 2.07,
  2010: 1.90, 2011: 1.60, 2012: 1.47, 2013: 1.37, 2014: 1.32,
  2015: 1.31, 2016: 1.28, 2017: 1.23, 2018: 1.19, 2019: 1.16,
  2020: 1.12, 2021: 1.10, 2022: 1.07, 2023: 1.04, 2024: 1.00,
  2025: 1.00
};

// Hệ số điều chỉnh áp dụng khi giải quyết chế độ trong năm 2026.
// Nguồn triển khai: Công văn 340/BHXH-CSXH ngày 03/02/2026.
export const ADJUSTMENT_FACTORS_2026 = {
  before1995: 5.81,
  1995: 4.91, 1996: 4.65, 1997: 4.50, 1998: 4.18, 1999: 4.01,
  2000: 4.07, 2001: 4.09, 2002: 3.94, 2003: 3.81, 2004: 3.54,
  2005: 3.27, 2006: 3.05, 2007: 2.81, 2008: 2.29, 2009: 2.14,
  2010: 1.96, 2011: 1.65, 2012: 1.51, 2013: 1.42, 2014: 1.36,
  2015: 1.36, 2016: 1.32, 2017: 1.28, 2018: 1.23, 2019: 1.20,
  2020: 1.16, 2021: 1.14, 2022: 1.11, 2023: 1.07, 2024: 1.03,
  2025: 1.00, 2026: 1.00
};

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

function levelForMonth(levels, yyyyMm) {
  let value = null;
  for (const row of levels) {
    if (yyyyMm >= row.from) value = row.amount;
  }
  return value;
}

export function referenceLevelForMonth(yyyyMm) {
  return levelForMonth(REFERENCE_LEVELS, yyyyMm) ?? REFERENCE_LEVELS[0].amount;
}

export function baseSalaryForMonth(yyyyMm) {
  return levelForMonth(BASE_SALARY_LEVELS, yyyyMm);
}

export function stateAverageWindowMonths(firstCompulsoryYm) {
  if (!firstCompulsoryYm) return null;
  const year = Number(firstCompulsoryYm.slice(0, 4));
  if (year < 1995) return 60;
  if (year <= 2000) return 72;
  if (year <= 2006) return 96;
  if (year <= 2015) return 120;
  if (year <= 2019) return 180;
  if (year <= 2024) return 240;
  return null; // từ 2025: toàn bộ thời gian
}

export function adjustmentFactorForYear(contributionYear, pensionYear) {
  let factors;
  let factorYear;
  let provisional = false;

  if (pensionYear <= 2025) {
    factors = ADJUSTMENT_FACTORS_2025;
    factorYear = 2025;
  } else {
    factors = ADJUSTMENT_FACTORS_2026;
    factorYear = 2026;
    provisional = pensionYear > 2026;
  }

  const key = contributionYear < 1995 ? "before1995" : contributionYear;
  let factor = factors[key];

  // Với năm đóng sau bộ hệ số mới nhất, chỉ dùng 1.00 để tạm tính và cảnh báo.
  if (factor == null && contributionYear > factorYear) {
    factor = 1;
    provisional = true;
  }

  return { factor: factor ?? null, factorYear, provisional };
}
