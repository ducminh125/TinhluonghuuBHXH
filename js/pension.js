import {
  normalRetirementAgeMonthsForYear,
  referenceLevelForMonth
} from "./rules.js";

export function ymToIndex(yyyyMm) {
  const [y, m] = String(yyyyMm || "").split("-").map(Number);
  if (!y || !m) return NaN;
  return y * 12 + (m - 1);
}

export function indexToYm(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonthsToYm(yyyyMm, months) {
  return indexToYm(ymToIndex(yyyyMm) + months);
}

export function monthsBetween(laterYm, earlierYm) {
  return ymToIndex(laterYm) - ymToIndex(earlierYm);
}

export function roundContributionYears(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const rem = totalMonths % 12;
  if (rem === 0) return years;
  if (rem <= 6) return years + 0.5;
  return years + 1;
}

export function basePensionRate(sex, totalMonths) {
  const y = roundContributionYears(totalMonths);
  if (y < 15) return 0;

  if (sex === "female") {
    return Math.min(75, 45 + Math.max(0, y - 15) * 2);
  }

  if (y < 20) {
    return Math.min(75, 40 + Math.max(0, y - 15));
  }

  return Math.min(75, 45 + Math.max(0, y - 20) * 2);
}

export function earlyRetirementReduction(earlyMonths) {
  if (earlyMonths <= 0) return 0;
  const fullYears = Math.floor(earlyMonths / 12);
  const remainder = earlyMonths % 12;
  return fullYears * 2 + (remainder >= 6 ? 1 : 0);
}

export function retirementAttainmentMonth(birthDate, sex, lowerByYears = 0) {
  if (!birthDate || !sex) return null;
  const birthYm = String(birthDate).slice(0, 7);
  const birthIndex = ymToIndex(birthYm);
  if (!Number.isFinite(birthIndex)) return null;

  // Quét theo tháng để tuổi nghỉ hưu bám đúng lộ trình của NĐ 135/2020/NĐ-CP.
  const startIndex = ymToIndex("2021-01");
  const endIndex = ymToIndex("2060-12");

  for (let idx = startIndex; idx <= endIndex; idx++) {
    const currentYm = indexToYm(idx);
    const year = Number(currentYm.slice(0, 4));
    const ageMonths = idx - birthIndex;
    const requiredAge = normalRetirementAgeMonthsForYear(sex, year) - lowerByYears * 12;
    if (ageMonths >= requiredAge) return currentYm;
  }

  return null;
}

export function statutoryRetirementAttainmentMonth(birthDate, sex) {
  return retirementAttainmentMonth(birthDate, sex, 0);
}

export function pensionStartMonthFromStatutoryMonth(statMonth) {
  return statMonth ? addMonthsToYm(statMonth, 1) : null;
}

export function earliestRetirementMonthForCase(birthDate, sex, retirementCase) {
  if (retirementCase === "heavy" || retirementCase === "impairment61") {
    return retirementAttainmentMonth(birthDate, sex, 5);
  }
  if (retirementCase === "coal" || retirementCase === "impairment81") {
    return retirementAttainmentMonth(birthDate, sex, 10);
  }
  if (retirementCase === "specialImpairment") return null;
  return statutoryRetirementAttainmentMonth(birthDate, sex);
}

function caseReferenceMonth(input, statutoryMonth) {
  if (!statutoryMonth) return null;
  if (input.retirementCase === "specialImpairment") {
    return retirementAttainmentMonth(input.birthDate, input.sex, 5);
  }
  return statutoryMonth;
}

export function evaluateEligibility(input) {
  const totalMonths = Number(input.totalMonths || 0);
  const compulsoryMonths = Number(input.compulsoryMonths || 0);
  const statutoryMonth = statutoryRetirementAttainmentMonth(input.birthDate, input.sex);
  const lower5Month = retirementAttainmentMonth(input.birthDate, input.sex, 5);
  const lower10Month = retirementAttainmentMonth(input.birthDate, input.sex, 10);
  const errors = [];
  const notes = [];
  let eligible = true;

  if (totalMonths < 180) {
    eligible = false;
    errors.push("Tổng thời gian đóng BHXH chưa đủ 15 năm để hưởng lương hưu theo điều kiện thông thường của Luật BHXH 2024.");
  }

  switch (input.retirementCase) {
    case "normal":
      if (statutoryMonth && input.retirementMonth < statutoryMonth) {
        eligible = false;
        errors.push("Tháng nghỉ hưu đang trước tháng đủ tuổi nghỉ hưu trong điều kiện lao động bình thường.");
      }
      break;

    case "heavy":
      if (compulsoryMonths < 180 || input.specialMonthsTotal < 180) {
        eligible = false;
        errors.push("Trường hợp nghề/công việc nặng nhọc hoặc vùng đặc biệt khó khăn cần tối thiểu 15 năm BHXH bắt buộc và 15 năm làm việc thuộc diện này.");
      }
      if (lower5Month && input.retirementMonth < lower5Month) {
        eligible = false;
        errors.push("Tháng nghỉ hưu thấp hơn quá 05 tuổi so với lộ trình tuổi nghỉ hưu thông thường.");
      }
      notes.push("Trường hợp nghỉ theo Điều 64 do tính chất nghề/công việc không bị giảm tỷ lệ như nghỉ hưu do suy giảm khả năng lao động.");
      break;

    case "coal":
      if (compulsoryMonths < 180 || input.specialMonthsTotal < 180) {
        eligible = false;
        errors.push("Trường hợp khai thác than trong hầm lò cần tối thiểu 15 năm BHXH bắt buộc và 15 năm làm công việc này.");
      }
      if (lower10Month && input.retirementMonth < lower10Month) {
        eligible = false;
        errors.push("Tháng nghỉ hưu thấp hơn quá 10 tuổi so với lộ trình tuổi nghỉ hưu thông thường.");
      }
      break;

    case "impairment61":
      if (compulsoryMonths < 240) {
        eligible = false;
        errors.push("Nghỉ hưu do suy giảm khả năng lao động cần tối thiểu 20 năm đóng BHXH bắt buộc.");
      }
      if (input.impairmentPercent < 61 || input.impairmentPercent >= 81) {
        eligible = false;
        errors.push("Nhóm này yêu cầu mức suy giảm khả năng lao động từ 61% đến dưới 81%.");
      }
      if (lower5Month && input.retirementMonth < lower5Month) {
        eligible = false;
        errors.push("Nhóm suy giảm từ 61% đến dưới 81% chỉ được nghỉ ở tuổi thấp hơn tối đa 05 tuổi theo lộ trình.");
      }
      break;

    case "impairment81":
      if (compulsoryMonths < 240) {
        eligible = false;
        errors.push("Nghỉ hưu do suy giảm khả năng lao động cần tối thiểu 20 năm đóng BHXH bắt buộc.");
      }
      if (input.impairmentPercent < 81) {
        eligible = false;
        errors.push("Nhóm này yêu cầu mức suy giảm khả năng lao động từ 81% trở lên.");
      }
      if (lower10Month && input.retirementMonth < lower10Month) {
        eligible = false;
        errors.push("Nhóm suy giảm từ 81% trở lên chỉ được nghỉ ở tuổi thấp hơn tối đa 10 tuổi theo lộ trình.");
      }
      break;

    case "specialImpairment":
      if (compulsoryMonths < 240) {
        eligible = false;
        errors.push("Trường hợp suy giảm khả năng lao động cần tối thiểu 20 năm đóng BHXH bắt buộc.");
      }
      if (input.impairmentPercent < 61) {
        eligible = false;
        errors.push("Trường hợp này yêu cầu suy giảm khả năng lao động từ 61% trở lên.");
      }
      if (input.specialMonthsTotal < 180) {
        eligible = false;
        errors.push("Cần ít nhất 15 năm làm nghề/công việc đặc biệt nặng nhọc, độc hại, nguy hiểm.");
      }
      notes.push("Đây là trường hợp đặc thù; tháng nghỉ thực tế cần nhập theo hồ sơ/điều kiện cụ thể để tính giảm trừ.");
      break;

    default:
      eligible = false;
      errors.push("Chưa chọn trường hợp nghỉ hưu hợp lệ.");
  }

  const penaltyReferenceMonth = caseReferenceMonth(input, statutoryMonth);
  const isImpairment = ["impairment61", "impairment81", "specialImpairment"].includes(input.retirementCase);
  const earlyMonths = isImpairment && penaltyReferenceMonth
    ? Math.max(0, monthsBetween(penaltyReferenceMonth, input.retirementMonth))
    : 0;

  return {
    eligible,
    errors: [...new Set(errors)],
    notes,
    totalMonths,
    compulsoryMonths,
    statutoryMonth,
    earlyMonths,
    caseEarliestMonth: earliestRetirementMonthForCase(input.birthDate, input.sex, input.retirementCase)
  };
}

export function calculatePension(input) {
  const eligibility = evaluateEligibility(input);
  const baseRate = basePensionRate(input.sex, eligibility.totalMonths);
  const reduction = ["impairment61", "impairment81", "specialImpairment"].includes(input.retirementCase)
    ? earlyRetirementReduction(eligibility.earlyMonths)
    : 0;
  const finalRate = Math.max(0, Math.min(75, baseRate - reduction));
  const rawMonthly = Number(input.averageBase || 0) * finalRate / 100;

  const pensionStartMonth = input.retirementMonth ? addMonthsToYm(input.retirementMonth, 1) : null;
  const referenceLevel = referenceLevelForMonth(pensionStartMonth || input.retirementMonth);
  const floorApplicable = Boolean(
    input.minimumFloorEligible &&
    input.firstCompulsoryYm && input.firstCompulsoryYm < "2025-07" &&
    eligibility.compulsoryMonths >= 240
  );
  const monthlyPension = floorApplicable ? Math.max(rawMonthly, referenceLevel) : rawMonthly;

  return {
    ...eligibility,
    roundedContributionYears: roundContributionYears(eligibility.totalMonths),
    baseRate,
    reduction,
    finalRate,
    rawMonthly,
    referenceLevel,
    floorApplicable,
    monthlyPension,
    pensionStartMonth
  };
}
