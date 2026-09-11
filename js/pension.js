import {
  normalRetirementAgeMonthsForYear,
  referenceLevelForMonth
} from "./rules.js";

export function ymToIndex(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
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
  const birthYm = birthDate.slice(0, 7);
  const birthIndex = ymToIndex(birthYm);

  // Quét theo từng tháng để bám đúng lộ trình tuổi theo từng năm.
  // Quan trọng: tuổi thấp hơn 5/10 năm cũng phải tính theo lộ trình riêng,
  // không lấy tháng nghỉ hưu thông thường rồi trừ cơ học 60/120 tháng.
  const startIndex = ymToIndex("2021-01");
  const endIndex = ymToIndex("2045-12");

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

function caseReferenceMonth(input, statutoryMonth) {
  if (!statutoryMonth) return null;
  if (input.retirementCase === "specialImpairment") {
    return retirementAttainmentMonth(input.birthDate, input.sex, 5);
  }
  return statutoryMonth;
}


export function evaluateEligibility(input) {
  const totalMonths = input.contributionYears * 12 + input.contributionMonths;
  const statutoryMonth = statutoryRetirementAttainmentMonth(input.birthDate, input.sex);
  const lower5Month = retirementAttainmentMonth(input.birthDate, input.sex, 5);
  const lower10Month = retirementAttainmentMonth(input.birthDate, input.sex, 10);
  const earlyFromNormal = statutoryMonth
    ? Math.max(0, monthsBetween(statutoryMonth, input.retirementMonth))
    : 0;

  const errors = [];
  const notes = [];
  let eligible = true;

  if (input.insuranceType === "voluntary") {
    if (totalMonths < 180) {
      eligible = false;
      errors.push("BHXH tự nguyện cần tối thiểu 15 năm đóng BHXH.");
    }
    if (statutoryMonth && input.retirementMonth < statutoryMonth) {
      eligible = false;
      errors.push("BHXH tự nguyện chỉ hưởng lương hưu khi đủ tuổi nghỉ hưu theo lộ trình thông thường.");
    }
    return { eligible, errors, notes, totalMonths, statutoryMonth, caseEarliestMonth: statutoryMonth, penaltyReferenceMonth: statutoryMonth, earlyMonths: 0 };
  }

  switch (input.retirementCase) {
    case "normal":
      if (totalMonths < 180) {
        eligible = false;
        errors.push("Cần tối thiểu 15 năm đóng BHXH bắt buộc.");
      }
      if (statutoryMonth && input.retirementMonth < statutoryMonth) {
        eligible = false;
        errors.push("Chưa đủ tuổi nghỉ hưu trong điều kiện lao động bình thường.");
      }
      break;

    case "heavy":
      if (totalMonths < 180 || input.specialYears * 12 + input.specialMonths < 180) {
        eligible = false;
        errors.push("Trường hợp nghề/công việc nặng nhọc hoặc vùng đặc biệt khó khăn cần ít nhất 15 năm đóng BHXH và 15 năm làm việc thuộc diện này.");
      }
      if (lower5Month && input.retirementMonth < lower5Month) {
        eligible = false;
        errors.push("Tuổi nghỉ hưu thấp hơn quá 05 năm so với tuổi nghỉ hưu thông thường.");
      }
      notes.push("Trường hợp thuộc Điều 64: nghỉ sớm theo tính chất nghề/công việc, không áp dụng giảm tỷ lệ theo Điều 66 khoản 3.");
      break;

    case "coal":
      if (totalMonths < 180 || input.specialYears * 12 + input.specialMonths < 180) {
        eligible = false;
        errors.push("Trường hợp khai thác than trong hầm lò cần ít nhất 15 năm đóng BHXH và 15 năm làm công việc này.");
      }
      if (lower10Month && input.retirementMonth < lower10Month) {
        eligible = false;
        errors.push("Tuổi nghỉ hưu thấp hơn quá 10 năm so với tuổi nghỉ hưu thông thường.");
      }
      notes.push("Trường hợp thuộc Điều 64: không áp dụng giảm tỷ lệ do suy giảm khả năng lao động.");
      break;

    case "impairment61":
      if (totalMonths < 240) {
        eligible = false;
        errors.push("Nghỉ hưu do suy giảm khả năng lao động cần tối thiểu 20 năm đóng BHXH bắt buộc.");
      }
      if (input.impairmentPercent < 61 || input.impairmentPercent >= 81) {
        eligible = false;
        errors.push("Nhóm này yêu cầu mức suy giảm khả năng lao động từ 61% đến dưới 81%.");
      }
      if (lower5Month && input.retirementMonth < lower5Month) {
        eligible = false;
        errors.push("Nhóm suy giảm 61% đến dưới 81% chỉ được nghỉ ở tuổi thấp hơn tối đa 05 tuổi theo lộ trình.");
      }
      break;

    case "impairment81":
      if (totalMonths < 240) {
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
      if (totalMonths < 240) {
        eligible = false;
        errors.push("Trường hợp suy giảm khả năng lao động cần tối thiểu 20 năm đóng BHXH bắt buộc.");
      }
      if (input.impairmentPercent < 61) {
        eligible = false;
        errors.push("Trường hợp này yêu cầu suy giảm khả năng lao động từ 61% trở lên.");
      }
      if (input.specialYears * 12 + input.specialMonths < 180) {
        eligible = false;
        errors.push("Cần ít nhất 15 năm làm nghề/công việc đặc biệt nặng nhọc, độc hại, nguy hiểm.");
      }
      notes.push("Mốc tính giảm tỷ lệ lấy theo tuổi nghỉ hưu thấp hơn của nhóm nghề/công việc tương ứng theo Nghị định 158/2025/NĐ-CP.");
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

  let caseEarliestMonth = statutoryMonth;
  if (["heavy", "impairment61"].includes(input.retirementCase)) caseEarliestMonth = lower5Month;
  if (["coal", "impairment81"].includes(input.retirementCase)) caseEarliestMonth = lower10Month;
  if (input.retirementCase === "specialImpairment") caseEarliestMonth = null;

  return { eligible, errors, notes, totalMonths, statutoryMonth, caseEarliestMonth, penaltyReferenceMonth, earlyMonths };
}

export function calculatePension(input) {
  const eligibility = evaluateEligibility(input);
  const baseRate = basePensionRate(input.sex, eligibility.totalMonths);
  const reduction = ["impairment61", "impairment81", "specialImpairment"].includes(input.retirementCase)
    ? earlyRetirementReduction(eligibility.earlyMonths)
    : 0;
  const finalRate = Math.max(0, Math.min(75, baseRate - reduction));
  const rawMonthly = input.averageBase * finalRate / 100;

  const referenceLevel = referenceLevelForMonth(input.retirementMonth);
  const floorApplicable = Boolean(
    input.minimumFloorEligible &&
    input.insuranceType === "compulsory" &&
    eligibility.totalMonths >= 240
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
    pensionStartMonth: input.retirementMonth ? addMonthsToYm(input.retirementMonth, 1) : null
  };
}
