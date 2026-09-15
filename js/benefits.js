import { calculateAverageBase, expandContributionPeriods } from './contributions.js';
import { referenceLevelForMonth } from './rules.js';

const REGIONAL_MINIMUM_WAGES = [
  { from: '2024-07', to: '2025-12', values: { I: 4960000, II: 4410000, III: 3860000, IV: 3450000 } },
  { from: '2026-01', to: '2026-12', values: { I: 5310000, II: 4730000, III: 4140000, IV: 3700000 } }
];

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validYm(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function average(values = []) {
  const nums = values.map(number).filter(v => v > 0);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function roundedYearsFromMonths(months) {
  const whole = Math.floor(Math.max(0, months) / 12);
  const odd = Math.max(0, months) % 12;
  return whole + (odd === 0 ? 0 : odd <= 6 ? 0.5 : 1);
}

export function calculateOneTimeSocialInsurance({ periods = [], settlementMonth, actualPaidVnd = 0, eligibilityReason = '' } = {}) {
  if (!validYm(settlementMonth)) {
    return { ok: false, errors: ['Cần nhập tháng dự kiến giải quyết BHXH một lần theo dạng mm/yyyy.'] };
  }
  const expanded = expandContributionPeriods(periods, settlementMonth);
  if (expanded.errors.length || !expanded.months.length) {
    return { ok: false, errors: expanded.errors.length ? expanded.errors : ['Chưa có quá trình đóng BHXH hợp lệ.'], warnings: expanded.warnings };
  }

  // Điều 72/104: mức bình quân dùng cho hưu trí và BHXH một lần theo cùng cơ chế
  // tiền lương/thu nhập đã điều chỉnh. Dùng tháng giải quyết làm mốc quy đổi.
  const avg = calculateAverageBase(periods, { retirementMonth: settlementMonth, pensionStartMonth: settlementMonth });
  if (!avg.ok) return { ok: false, errors: avg.errors, warnings: avg.warnings || [] };

  const months = expanded.months;
  const totalMonths = months.length;
  const pre2014Months = months.filter(m => m.ym < '2014-01').length;
  const post2014OriginalMonths = totalMonths - pre2014Months;
  const warnings = [...new Set([...(expanded.warnings || []), ...(avg.warnings || [])])];
  if (months.some(m => m.regime === 'voluntary')) {
    warnings.push('Có thời gian BHXH tự nguyện: mức hưởng chính thức không bao gồm phần ngân sách nhà nước hỗ trợ tiền đóng, trừ các trường hợp pháp luật cho phép. Dữ liệu quá trình đóng hiện tại không tách riêng phần hỗ trợ này nên cần đối chiếu cơ quan BHXH.');
  }

  if (totalMonths < 12) {
    const cap = 2 * avg.averageBase;
    const paid = Math.max(0, number(actualPaidVnd));
    const estimatedAmount = paid > 0 ? Math.min(paid, cap) : null;
    if (!paid) warnings.push('Thời gian đóng chưa đủ 01 năm: Luật quy định mức hưởng bằng số tiền đã đóng nhưng không quá 02 tháng mức bình quân. Cần nhập tổng số tiền đã đóng thực tế để xác định số tiền chính xác.');
    return {
      ok: true,
      benefitType: 'one_time',
      settlementMonth,
      eligibilityReason,
      totalMonths,
      pre2014Months,
      post2014Months: post2014OriginalMonths,
      pre2014Years: 0,
      post2014Years: 0,
      averageBase: avg.averageBase,
      estimatedAmount,
      underOneYear: true,
      actualPaidVnd: paid || null,
      maximumAmount: cap,
      avg,
      warnings,
      notes: ['Kết quả chỉ ước tính mức tiền; người lao động vẫn phải thuộc một trường hợp đủ điều kiện hưởng BHXH một lần theo Điều 70 hoặc Điều 102 Luật BHXH 2024.']
    };
  }

  let pre2014Years = 0;
  let post2014Months = post2014OriginalMonths;
  if (pre2014Months > 0 && post2014OriginalMonths > 0) {
    pre2014Years = Math.floor(pre2014Months / 12);
    post2014Months += pre2014Months % 12;
  } else if (pre2014Months > 0) {
    pre2014Years = roundedYearsFromMonths(pre2014Months);
  }
  const post2014Years = roundedYearsFromMonths(post2014Months);
  const preAmount = pre2014Years * 1.5 * avg.averageBase;
  const postAmount = post2014Years * 2 * avg.averageBase;
  const estimatedAmount = preAmount + postAmount;

  return {
    ok: true,
    benefitType: 'one_time',
    settlementMonth,
    eligibilityReason,
    totalMonths,
    pre2014Months,
    post2014Months: post2014OriginalMonths,
    transferredPre2014OddMonths: pre2014Months > 0 && post2014OriginalMonths > 0 ? pre2014Months % 12 : 0,
    pre2014Years,
    post2014Years,
    averageBase: avg.averageBase,
    preAmount,
    postAmount,
    estimatedAmount,
    underOneYear: false,
    avg,
    warnings,
    notes: ['Mỗi năm trước 2014 tính 1,5 tháng mức bình quân; từ 2014 trở đi tính 2 tháng mức bình quân. Tháng lẻ trước 2014 được chuyển sang giai đoạn từ 2014 nếu có cả hai giai đoạn.']
  };
}

export function regionalMinimumWage(region, eventMonth = '2026-01') {
  const key = String(region || '').toUpperCase();
  if (!['I', 'II', 'III', 'IV'].includes(key) || !validYm(eventMonth)) return null;
  const row = REGIONAL_MINIMUM_WAGES.find(r => eventMonth >= r.from && (!r.to || eventMonth <= r.to));
  return row?.values?.[key] ?? null;
}

export function calculateUnemploymentBenefit({ eligibleContributionMonths = 0, lastSixSalaries = [], region = '', lastContributionMonth = '' } = {}) {
  const months = Math.max(0, Math.trunc(number(eligibleContributionMonths)));
  if (!validYm(lastContributionMonth)) return { ok: false, errors: ['Cần nhập tháng cuối cùng đóng BHTN.'] };
  if (lastContributionMonth < '2026-01') return { ok: false, errors: ['Tab trợ cấp thất nghiệp này áp dụng Luật Việc làm 2025 từ 01/01/2026. Trường hợp có tháng cuối đóng BHTN trước 01/2026 cần áp dụng quy định chuyển tiếp/luật cũ.'] };
  if (lastContributionMonth > '2026-12') return { ok: false, errors: ['Chưa tích hợp mức lương tối thiểu vùng sau năm 2026. Cần cập nhật văn bản mới trước khi tính trường hợp này.'] };
  const salaries = lastSixSalaries.map(number).filter(v => v > 0);
  if (salaries.length !== 6) return { ok: false, errors: ['Cần nhập đủ 06 mức tiền lương tháng đóng BHTN liền kề trước khi thất nghiệp.'] };
  const minimumWage = regionalMinimumWage(region, lastContributionMonth);
  if (!minimumWage) return { ok: false, errors: ['Chưa xác định được mức lương tối thiểu vùng tại tháng cuối đóng BHTN.'] };

  const averageSix = average(salaries);
  const rawMonthly = averageSix * 0.6;
  const ceiling = minimumWage * 5;
  const monthlyBenefit = Math.min(rawMonthly, ceiling);
  let durationMonths = 0;
  if (months >= 12) durationMonths = Math.min(12, 3 + Math.max(0, Math.floor((months - 36) / 12)));
  const eligibleByMonths = months >= 12;

  return {
    ok: true,
    benefitType: 'unemployment',
    eligibleByMonths,
    eligibleContributionMonths: months,
    lastContributionMonth,
    region: String(region).toUpperCase(),
    minimumWage,
    averageSix,
    rawMonthly,
    ceiling,
    monthlyBenefit: eligibleByMonths ? monthlyBenefit : 0,
    durationMonths,
    estimatedTotal: eligibleByMonths ? monthlyBenefit * durationMonths : 0,
    warnings: eligibleByMonths ? [] : ['Thời gian đóng BHTN chưa đủ 12 tháng nên chưa đạt điều kiện tối thiểu về thời gian đóng để tính số tháng hưởng.'],
    notes: ['Mức hằng tháng bằng 60% bình quân 06 tháng đóng BHTN gần nhất, tối đa 05 lần lương tối thiểu vùng tại tháng cuối đóng BHTN.', 'Điều kiện hưởng thực tế còn phụ thuộc việc chấm dứt hợp đồng, thời hạn nộp hồ sơ và các điều kiện khác theo Luật Việc làm.']
  };
}

function maternityAverage(salaries = []) {
  return average(salaries);
}

function maleBirthLeaveDays(children, surgeryOrUnder32) {
  const n = Math.max(1, Math.trunc(number(children)) || 1);
  if (n === 1) return surgeryOrUnder32 ? 7 : 5;
  if (surgeryOrUnder32) return 14 + Math.max(0, n - 2) * 3;
  return 10 + Math.max(0, n - 2) * 3;
}

function pregnancyLossMaxDays(weeks) {
  const w = Math.max(0, number(weeks));
  if (w < 5) return 10;
  if (w < 13) return 20;
  if (w < 22) return 40;
  return 50;
}

export function calculateMaternityBenefit(input = {}) {
  const scheme = input.scheme === 'voluntary' ? 'voluntary' : 'compulsory';
  const caseType = String(input.caseType || 'female_birth');
  const eventMonth = String(input.eventMonth || '');
  if (!validYm(eventMonth)) return { ok: false, errors: ['Cần nhập tháng xảy ra sự kiện thai sản.'] };
  const children = Math.max(1, Math.trunc(number(input.children)) || 1);
  const months12 = Math.max(0, Math.trunc(number(input.months12)));
  const months24 = Math.max(0, Math.trunc(number(input.months24)));
  const totalPriorMonths = Math.max(0, Math.trunc(number(input.totalPriorMonths)));

  if (scheme === 'voluntary') {
    if (!['female_birth', 'male_birth'].includes(caseType)) return { ok: false, errors: ['BHXH tự nguyện hiện chỉ có trợ cấp thai sản khi sinh con trong công cụ này.'] };
    const eligible = months12 >= 6;
    return {
      ok: true,
      benefitType: 'maternity', scheme, caseType, eventMonth, children,
      eligible,
      months12,
      lumpSum: eligible ? 2000000 * children : 0,
      estimatedTotal: eligible ? 2000000 * children : 0,
      monthlyBenefit: null,
      durationLabel: 'Trợ cấp một lần',
      warnings: eligible ? [] : ['BHXH tự nguyện cần có từ đủ 06 tháng đóng trong 12 tháng trước khi sinh con.'],
      notes: ['Mức trợ cấp thai sản BHXH tự nguyện là 2.000.000 đồng cho mỗi con theo Luật BHXH 2024.', 'Nếu cả cha và mẹ cùng tham gia BHXH tự nguyện và đều đủ điều kiện thì chỉ cha hoặc mẹ được hưởng trợ cấp thai sản tự nguyện cho cùng lần sinh.']
    };
  }

  const salaries = (input.salaryMonths || []).map(number).filter(v => v > 0);
  if (!salaries.length) return { ok: false, errors: ['Cần nhập mức tiền lương đóng BHXH bắt buộc gần nhất trước khi nghỉ hưởng thai sản.'] };
  if (salaries.length > 6) salaries.length = 6;
  if (caseType === 'female_birth' && salaries.length < 6) return { ok: false, errors: ['Lao động nữ sinh con cần nhập đủ 06 mức tiền lương làm căn cứ đóng BHXH gần nhất trước khi nghỉ để tính đúng mức bình quân theo Điều 59 Luật BHXH 2024.'] };
  const avgSalary = maternityAverage(salaries);
  const referenceLevel = referenceLevelForMonth(eventMonth);
  const warnings = [];
  if (eventMonth > '2026-12') warnings.push('Tháng sự kiện sau năm 2026 đang tạm dùng mức tham chiếu gần nhất đã tích hợp; cần cập nhật văn bản mới trước khi sử dụng kết quả chính thức.');
  const base = { ok: true, benefitType: 'maternity', scheme, caseType, eventMonth, children, months12, months24, totalPriorMonths, averageSalary: avgSalary, referenceLevel, warnings };

  if (caseType === 'female_birth') {
    const infertility = Boolean(input.infertilityTreatment);
    const pregnancyLeave = Boolean(input.pregnancyLeave);
    let eligible;
    let eligibilityRule;
    if (infertility) {
      eligible = months24 >= 6;
      eligibilityRule = 'Từ đủ 06 tháng trong 24 tháng trước sinh do phải nghỉ điều trị vô sinh.';
    } else if (pregnancyLeave && totalPriorMonths >= 12) {
      eligible = months12 >= 3;
      eligibilityRule = 'Đã đóng từ đủ 12 tháng và phải nghỉ dưỡng thai: từ đủ 03 tháng trong 12 tháng trước sinh.';
    } else {
      eligible = months12 >= 6;
      eligibilityRule = 'Từ đủ 06 tháng trong 12 tháng liền kề trước sinh.';
    }
    const durationMonths = 6 + Math.max(0, children - 1);
    const monthlyPart = eligible ? avgSalary * durationMonths : 0;
    const lumpSum = eligible ? 2 * referenceLevel * children : 0;
    if (!eligible) warnings.push('Dữ liệu số tháng đóng chưa đạt điều kiện đã chọn cho lao động nữ sinh con.');
    return { ...base, eligible, eligibilityRule, durationMonths, durationLabel: `${durationMonths} tháng`, monthlyBenefit: avgSalary, maternityPay: monthlyPart, lumpSum, estimatedTotal: monthlyPart + lumpSum, notes: ['Trợ cấp tháng bằng 100% bình quân tiền lương đóng BHXH của 06 tháng gần nhất trước khi nghỉ; trợ cấp một lần khi sinh con bằng 02 lần mức tham chiếu cho mỗi con.'] };
  }

  if (caseType === 'male_birth') {
    const days = maleBirthLeaveDays(children, Boolean(input.surgeryOrUnder32));
    const daily = avgSalary / 24;
    const leavePay = daily * days;
    const fatherLumpEligible = Boolean(input.fatherLumpEligible) && months12 >= 6;
    const lumpSum = fatherLumpEligible ? 2 * referenceLevel * children : 0;
    return { ...base, eligible: true, durationDays: days, durationLabel: `${days} ngày làm việc`, dailyBenefit: daily, monthlyBenefit: avgSalary, maternityPay: leavePay, lumpSum, estimatedTotal: leavePay + lumpSum, notes: ['Lao động nam đang tham gia BHXH bắt buộc khi vợ sinh con được nghỉ theo số ngày luật định; mức một ngày bằng mức trợ cấp tháng chia 24.', fatherLumpEligible ? 'Đã tính trợ cấp một lần theo xác nhận người dùng về điều kiện của người cha.' : 'Chưa cộng trợ cấp một lần cho người cha; chỉ bật khi mẹ không đủ điều kiện và cha đáp ứng điều kiện pháp luật.'] };
  }

  if (caseType === 'prenatal') {
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(10, requested || 0);
    if (!days) return { ok: false, errors: ['Nhập số ngày nghỉ khám thai (tối đa 10 ngày làm việc).'] };
    const daily = avgSalary / 24;
    return { ...base, eligible: true, durationDays: days, durationLabel: `${days} ngày làm việc`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: ['Khám thai tối đa 05 lần, mỗi lần không quá 02 ngày; mức một ngày bằng trợ cấp tháng chia 24.'] };
  }

  if (caseType === 'pregnancy_loss') {
    const weeks = Math.max(0, number(input.gestationWeeks));
    const maxDays = pregnancyLossMaxDays(weeks);
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(maxDays, requested || maxDays);
    const daily = avgSalary / 30;
    if (weeks >= 22) warnings.push('Thai từ đủ 22 tuần trở lên có trường hợp được hưởng như sinh con nếu đáp ứng điều kiện tại Điều 50; kết quả này đang tính theo số ngày nghỉ tối đa của Điều 52, cần đối chiếu hồ sơ thực tế.');
    return { ...base, eligible: true, gestationWeeks: weeks, maxDays, durationDays: days, durationLabel: `${days} ngày`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: ['Thời gian nghỉ tối đa phụ thuộc tuổi thai; mức một ngày trong trường hợp Điều 52 bằng trợ cấp tháng chia 30.'] };
  }

  if (caseType === 'contraception_iud' || caseType === 'contraception_sterilization') {
    const maxDays = caseType === 'contraception_iud' ? 7 : 15;
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(maxDays, requested || maxDays);
    const daily = avgSalary / 30;
    return { ...base, eligible: true, maxDays, durationDays: days, durationLabel: `${days} ngày`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: [`Thời gian nghỉ tối đa ${maxDays} ngày theo trường hợp đã chọn; mức một ngày tính theo trợ cấp tháng chia 30.`] };
  }

  return { ok: false, errors: ['Trường hợp thai sản chưa được hỗ trợ.'] };
}

export const BENEFIT_LABELS = {
  pension: 'Lương hưu',
  one_time: 'BHXH một lần',
  unemployment: 'Trợ cấp thất nghiệp',
  maternity: 'Chế độ thai sản'
};
