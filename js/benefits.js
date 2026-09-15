import { calculateAverageBase, expandContributionPeriods } from './contributions.js';
import { referenceLevelForMonth } from './rules.js';
import { statutoryRetirementAttainmentMonth } from './pension.js';

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

export function calculateOneTimeSocialInsurance({
  periods = [],
  settlementMonth,
  actualPaidVnd = 0,
  eligibilityReason = '',
  person = {},
  stoppedParticipation = false,
  stopped12Months = false,
  seriousConditionConfirmed = false
} = {}) {
  if (!validYm(settlementMonth)) {
    return { ok: false, errors: ['Cần nhập tháng dự kiến giải quyết BHXH một lần theo dạng mm/yyyy.'] };
  }
  const expanded = expandContributionPeriods(periods, settlementMonth);
  if (expanded.errors.length || !expanded.months.length) {
    return { ok: false, errors: expanded.errors.length ? expanded.errors : ['Chưa có quá trình đóng BHXH hợp lệ.'], warnings: expanded.warnings };
  }

  const months = expanded.months;
  const totalMonths = months.length;
  const pre2014Months = months.filter(m => m.ym < '2014-01').length;
  const post2014OriginalMonths = totalMonths - pre2014Months;
  const hasPreJuly2025Contribution = months.some(m => m.ym < '2025-07');
  const eligibilityErrors = [];
  let eligibilityRule = '';

  if (!stoppedParticipation) {
    eligibilityErrors.push('BHXH một lần chỉ được giải quyết khi người lao động đã chấm dứt tham gia BHXH và có đề nghị hưởng.');
  }

  if (eligibilityReason === 'retirement_age') {
    eligibilityRule = 'Đủ tuổi hưởng lương hưu nhưng có thời gian đóng BHXH chưa đủ 15 năm.';
    if (totalMonths >= 180) eligibilityErrors.push('Trường hợp đủ tuổi hưởng lương hưu chỉ được hưởng BHXH một lần theo lý do này khi thời gian đóng chưa đủ 15 năm.');
    const birthDate = String(person?.birthDate || '');
    const sex = String(person?.sex || '');
    const statutoryMonth = birthDate && sex ? statutoryRetirementAttainmentMonth(birthDate, sex) : null;
    if (!statutoryMonth) eligibilityErrors.push('Cần nhập giới tính và ngày sinh ở tab Lương hưu để kiểm tra đã đủ tuổi hưởng lương hưu hay chưa.');
    else if (settlementMonth < statutoryMonth) eligibilityErrors.push(`Tại ${settlementMonth}, người lao động chưa đến tháng đủ tuổi nghỉ hưu theo dữ liệu ngày sinh/giới tính đã nhập.`);
  } else if (eligibilityReason === 'emigration') {
    eligibilityRule = 'Ra nước ngoài để định cư sau khi đã chấm dứt tham gia BHXH.';
  } else if (eligibilityReason === 'serious_condition') {
    eligibilityRule = 'Thuộc trường hợp bệnh được luật liệt kê hoặc suy giảm khả năng lao động từ 81% trở lên/khuyết tật đặc biệt nặng.';
    if (!seriousConditionConfirmed) eligibilityErrors.push('Cần xác nhận người lao động thực sự thuộc nhóm bệnh được luật liệt kê hoặc có mức suy giảm khả năng lao động từ 81% trở lên/khuyết tật đặc biệt nặng.');
  } else if (eligibilityReason === 'pre2025_after12months') {
    eligibilityRule = 'Có thời gian đóng trước 01/07/2025; sau 12 tháng không thuộc diện BHXH bắt buộc và không tham gia BHXH tự nguyện; tổng thời gian đóng chưa đủ 20 năm.';
    if (!hasPreJuly2025Contribution) eligibilityErrors.push('Không có thời gian đóng BHXH trước ngày 01/07/2025 nên không thuộc trường hợp chuyển tiếp này.');
    if (!stopped12Months) eligibilityErrors.push('Cần đủ 12 tháng không thuộc diện tham gia BHXH bắt buộc và không tham gia BHXH tự nguyện.');
    if (totalMonths >= 240) eligibilityErrors.push('Trường hợp sau 12 tháng không tiếp tục tham gia chỉ áp dụng khi tổng thời gian đóng BHXH chưa đủ 20 năm.');
  } else {
    eligibilityRule = 'Cần chọn một trường hợp đủ điều kiện cụ thể theo Điều 70/Điều 102 Luật BHXH 2024.';
    eligibilityErrors.push('Chưa xác định được trường hợp đủ điều kiện hưởng BHXH một lần. Hãy chọn một lý do cụ thể để hệ thống kiểm tra.');
  }

  if (eligibilityErrors.length) {
    return {
      ok: true,
      eligible: false,
      benefitType: 'one_time',
      settlementMonth,
      eligibilityReason,
      eligibilityRule,
      eligibilityErrors: [...new Set(eligibilityErrors)],
      totalMonths,
      pre2014Months,
      post2014Months: post2014OriginalMonths,
      hasPreJuly2025Contribution,
      warnings: expanded.warnings || []
    };
  }

  // Điều 72/104: mức bình quân dùng cho hưu trí và BHXH một lần theo cùng cơ chế
  // tiền lương/thu nhập đã điều chỉnh. Dùng tháng giải quyết làm mốc quy đổi.
  const avg = calculateAverageBase(periods, { retirementMonth: settlementMonth, pensionStartMonth: settlementMonth });
  if (!avg.ok) return { ok: false, errors: avg.errors, warnings: avg.warnings || [] };

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
      eligible: true,
      benefitType: 'one_time',
      settlementMonth,
      eligibilityReason,
      eligibilityRule,
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
      notes: ['Kết quả ước tính được tính sau khi dữ liệu đầu vào đạt điều kiện của trường hợp hưởng đã chọn. Hồ sơ chính thức vẫn do cơ quan BHXH xác định.']
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
    eligible: true,
    benefitType: 'one_time',
    settlementMonth,
    eligibilityReason,
    eligibilityRule,
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

export function calculateUnemploymentBenefit({
  eligibleContributionMonths = 0,
  lookbackContributionMonths = 0,
  contractGroup = 'standard',
  wasContributingAtTermination = false,
  lawfulTermination = false,
  filedWithin3Months = false,
  noExclusionAfter10Days = false,
  lastSixSalaries = [],
  region = '',
  lastContributionMonth = ''
} = {}) {
  const months = Math.max(0, Math.trunc(number(eligibleContributionMonths)));
  const lookbackMonths = Math.max(0, Math.trunc(number(lookbackContributionMonths)));
  if (!validYm(lastContributionMonth)) return { ok: false, errors: ['Cần nhập tháng cuối cùng đóng BHTN.'] };
  if (lastContributionMonth < '2026-01') return { ok: false, errors: ['Tab trợ cấp thất nghiệp này áp dụng Luật Việc làm 2025 từ 01/01/2026. Trường hợp có tháng cuối đóng BHTN trước 01/2026 cần áp dụng quy định chuyển tiếp/luật cũ.'] };
  if (lastContributionMonth > '2026-12') return { ok: false, errors: ['Chưa tích hợp mức lương tối thiểu vùng sau năm 2026. Cần cập nhật văn bản mới trước khi tính trường hợp này.'] };

  const isShortContract = contractGroup === 'short_1_12';
  const lookbackWindow = isShortContract ? 36 : 24;
  const eligibilityErrors = [];
  if (!wasContributingAtTermination) eligibilityErrors.push('Tại thời điểm chấm dứt việc làm, người lao động phải thuộc trường hợp đang đóng bảo hiểm thất nghiệp theo quy định.');
  if (!lawfulTermination) eligibilityErrors.push('Việc chấm dứt hợp đồng/việc làm phải đúng pháp luật và không thuộc trường hợp nghỉ việc khi đã đủ điều kiện hưởng lương hưu.');
  if (months < 12) eligibilityErrors.push('Tổng thời gian đóng BHTN chưa sử dụng để tính lần hưởng này phải từ đủ 12 tháng.');
  if (lookbackMonths < 12) eligibilityErrors.push(`Cần đóng BHTN từ đủ 12 tháng trong ${lookbackWindow} tháng trước khi chấm dứt việc làm.`);
  if (!filedWithin3Months) eligibilityErrors.push('Hồ sơ hưởng trợ cấp thất nghiệp phải được nộp trong thời hạn 03 tháng kể từ ngày chấm dứt việc làm.');
  if (!noExclusionAfter10Days) eligibilityErrors.push('Trong 10 ngày làm việc kể từ khi nộp đủ hồ sơ, người lao động không được thuộc các trường hợp loại trừ theo Điều 38 Luật Việc làm 2025.');

  if (eligibilityErrors.length) {
    return {
      ok: true,
      eligible: false,
      benefitType: 'unemployment',
      eligibleContributionMonths: months,
      lookbackContributionMonths: lookbackMonths,
      lookbackWindow,
      contractGroup,
      lastContributionMonth,
      eligibilityErrors: [...new Set(eligibilityErrors)],
      warnings: [],
      notes: ['Chỉ khi đủ toàn bộ điều kiện hưởng, hệ thống mới tính mức trợ cấp và trừ lượt tính.']
    };
  }

  const salaries = lastSixSalaries.map(number).filter(v => v > 0);
  if (salaries.length !== 6) return { ok: false, errors: ['Cần nhập đủ 06 mức tiền lương tháng đóng BHTN gần nhất trước khi chấm dứt việc làm.'] };
  const minimumWage = regionalMinimumWage(region, lastContributionMonth);
  if (!minimumWage) return { ok: false, errors: ['Chưa xác định được mức lương tối thiểu vùng tại tháng cuối đóng BHTN.'] };

  const averageSix = average(salaries);
  const rawMonthly = averageSix * 0.6;
  const ceiling = minimumWage * 5;
  const monthlyBenefit = Math.min(rawMonthly, ceiling);
  const durationMonths = Math.min(12, 3 + Math.max(0, Math.floor((months - 36) / 12)));

  return {
    ok: true,
    eligible: true,
    benefitType: 'unemployment',
    eligibleContributionMonths: months,
    lookbackContributionMonths: lookbackMonths,
    lookbackWindow,
    contractGroup,
    lastContributionMonth,
    region: String(region).toUpperCase(),
    minimumWage,
    averageSix,
    rawMonthly,
    ceiling,
    monthlyBenefit,
    durationMonths,
    estimatedTotal: monthlyBenefit * durationMonths,
    warnings: [],
    notes: [
      'Mức hằng tháng bằng 60% bình quân 06 tháng đóng BHTN gần nhất, tối đa 05 lần lương tối thiểu vùng tại tháng cuối đóng BHTN.',
      `Điều kiện thời gian đóng đang áp dụng: từ đủ 12 tháng trong ${lookbackWindow} tháng trước khi chấm dứt việc làm.`
    ]
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
  const activeCompulsoryAtEvent = Boolean(input.activeCompulsoryAtEvent);

  if (scheme === 'voluntary') {
    if (!['female_birth', 'male_birth'].includes(caseType)) return { ok: false, errors: ['BHXH tự nguyện hiện chỉ có trợ cấp thai sản khi sinh con trong công cụ này.'] };
    const eligible = months12 >= 6;
    return {
      ok: true,
      eligible,
      eligibilityErrors: eligible ? [] : ['BHXH tự nguyện cần có từ đủ 06 tháng đóng trong 12 tháng trước khi sinh con.'],
      eligibilityRule: 'Đóng BHXH tự nguyện từ đủ 06 tháng trong 12 tháng trước khi sinh con.',
      benefitType: 'maternity', scheme, caseType, eventMonth, children,
      months12,
      lumpSum: eligible ? 2000000 * children : 0,
      estimatedTotal: eligible ? 2000000 * children : 0,
      monthlyBenefit: null,
      durationLabel: 'Trợ cấp một lần',
      warnings: [],
      notes: ['Mức trợ cấp thai sản BHXH tự nguyện là 2.000.000 đồng cho mỗi con theo Luật BHXH 2024.', 'Nếu cả cha và mẹ cùng tham gia BHXH tự nguyện và đều đủ điều kiện thì chỉ cha hoặc mẹ được hưởng trợ cấp thai sản tự nguyện cho cùng lần sinh.']
    };
  }

  const referenceLevel = referenceLevelForMonth(eventMonth);
  const warnings = [];
  if (eventMonth > '2026-12') warnings.push('Tháng sự kiện sau năm 2026 đang tạm dùng mức tham chiếu gần nhất đã tích hợp; cần cập nhật văn bản mới trước khi sử dụng kết quả chính thức.');
  const base = { ok: true, benefitType: 'maternity', scheme, caseType, eventMonth, children, months12, months24, totalPriorMonths, activeCompulsoryAtEvent, referenceLevel, warnings };

  if (caseType === 'female_birth') {
    const infertility = Boolean(input.infertilityTreatment);
    const pregnancyLeave = Boolean(input.pregnancyLeave);
    const eligibilityErrors = [];
    let eligibilityRule;
    if (infertility && pregnancyLeave) {
      eligibilityRule = 'Chỉ chọn một trường hợp đặc biệt để kiểm tra điều kiện.';
      eligibilityErrors.push('Không chọn đồng thời “nghỉ dưỡng thai theo chỉ định” và “điều trị vô sinh”. Hãy chọn đúng trường hợp thực tế.');
    } else if (infertility) {
      eligibilityRule = 'Phải nghỉ việc để điều trị vô sinh: đóng BHXH bắt buộc từ đủ 06 tháng trong 24 tháng liền kề trước khi sinh.';
      if (months24 < 6) eligibilityErrors.push('Trường hợp điều trị vô sinh cần đóng BHXH bắt buộc từ đủ 06 tháng trong 24 tháng liền kề trước khi sinh.');
    } else if (pregnancyLeave) {
      eligibilityRule = 'Nghỉ dưỡng thai theo chỉ định: đã đóng BHXH bắt buộc từ đủ 12 tháng trở lên trước đó và có từ đủ 03 tháng đóng trong 12 tháng liền kề trước khi sinh.';
      if (totalPriorMonths < 12) eligibilityErrors.push('Trường hợp nghỉ dưỡng thai theo chỉ định cần có tổng thời gian đã đóng BHXH bắt buộc từ đủ 12 tháng trở lên.');
      if (months12 < 3) eligibilityErrors.push('Trường hợp nghỉ dưỡng thai theo chỉ định cần đóng BHXH bắt buộc từ đủ 03 tháng trong 12 tháng liền kề trước khi sinh.');
    } else {
      eligibilityRule = 'Lao động nữ sinh con: đóng BHXH bắt buộc từ đủ 06 tháng trong 12 tháng liền kề trước khi sinh.';
      if (months12 < 6) eligibilityErrors.push('Lao động nữ sinh con cần đóng BHXH bắt buộc từ đủ 06 tháng trong 12 tháng liền kề trước khi sinh.');
    }
    if (eligibilityErrors.length) return { ...base, eligible: false, eligibilityRule, eligibilityErrors };

    const salaries = (input.salaryMonths || []).map(number).filter(v => v > 0).slice(0, 6);
    if (salaries.length < 6) return { ok: false, errors: ['Lao động nữ sinh con cần nhập đủ 06 mức tiền lương làm căn cứ đóng BHXH gần nhất trước khi nghỉ để tính đúng mức bình quân theo Điều 59 Luật BHXH 2024.'] };
    const avgSalary = maternityAverage(salaries);
    const durationMonths = 6 + Math.max(0, children - 1);
    const monthlyPart = avgSalary * durationMonths;
    const lumpSum = 2 * referenceLevel * children;
    return { ...base, eligible: true, eligibilityRule, eligibilityErrors: [], averageSalary: avgSalary, durationMonths, durationLabel: `${durationMonths} tháng`, monthlyBenefit: avgSalary, maternityPay: monthlyPart, lumpSum, estimatedTotal: monthlyPart + lumpSum, notes: ['Trợ cấp tháng bằng 100% bình quân tiền lương đóng BHXH của 06 tháng gần nhất trước khi nghỉ; trợ cấp một lần khi sinh con bằng 02 lần mức tham chiếu cho mỗi con.'] };
  }

  if (caseType === 'male_birth') {
    const fatherLumpRequested = Boolean(input.fatherLumpEligible);
    const leaveEligible = activeCompulsoryAtEvent;
    const fatherLumpEligible = fatherLumpRequested && months12 >= 6;
    const eligibilityErrors = [];
    if (!leaveEligible && !fatherLumpEligible) {
      eligibilityErrors.push('Lao động nam muốn hưởng thời gian nghỉ khi vợ sinh con phải đang tham gia BHXH bắt buộc tại thời điểm vợ sinh con.');
      if (fatherLumpRequested && months12 < 6) eligibilityErrors.push('Để nhận trợ cấp một lần do mẹ không đủ điều kiện, người cha cần đóng BHXH bắt buộc từ đủ 06 tháng trong 12 tháng trước khi sinh.');
      return { ...base, eligible: false, eligibilityRule: 'Cha được nghỉ khi đang tham gia BHXH bắt buộc; trợ cấp một lần của cha áp dụng khi mẹ không đủ điều kiện và cha đủ điều kiện thời gian đóng.', eligibilityErrors };
    }

    let avgSalary = 0;
    let leavePay = 0;
    let daily = null;
    let days = 0;
    if (leaveEligible) {
      const salaries = (input.salaryMonths || []).map(number).filter(v => v > 0).slice(0, 6);
      if (!salaries.length) return { ok: false, errors: ['Cần nhập mức tiền lương đóng BHXH bắt buộc gần nhất của người cha để tính tiền nghỉ thai sản.'] };
      avgSalary = maternityAverage(salaries);
      days = maleBirthLeaveDays(children, Boolean(input.surgeryOrUnder32));
      daily = avgSalary / 24;
      leavePay = daily * days;
    }
    const lumpSum = fatherLumpEligible ? 2 * referenceLevel * children : 0;
    const notes = [];
    if (leaveEligible) notes.push(Boolean(input.surgeryOrUnder32) ? 'Vợ sinh phẫu thuật hoặc con dưới 32 tuần tuổi: thời gian nghỉ của cha được áp dụng theo nhóm ngày nghỉ đặc biệt của Điều 53.' : 'Người cha đang tham gia BHXH bắt buộc được nghỉ theo số ngày luật định khi vợ sinh con.');
    if (fatherLumpEligible) notes.push('Đã tính trợ cấp một lần cho người cha theo xác nhận mẹ không đủ điều kiện và cha có từ đủ 06 tháng đóng trong 12 tháng trước sinh.');
    return { ...base, eligible: true, eligibilityErrors: [], eligibilityRule: 'Cha đang tham gia BHXH bắt buộc được nghỉ khi vợ sinh con; cha có thể được trợ cấp một lần nếu mẹ không đủ điều kiện và cha đáp ứng thời gian đóng.', durationDays: days, durationLabel: leaveEligible ? `${days} ngày làm việc` : 'Chỉ trợ cấp một lần', dailyBenefit: daily, monthlyBenefit: leaveEligible ? avgSalary : null, maternityPay: leavePay, lumpSum, estimatedTotal: leavePay + lumpSum, notes };
  }

  const activeEligibility = [];
  if (!activeCompulsoryAtEvent) activeEligibility.push('Trường hợp này yêu cầu người lao động đang thuộc diện tham gia BHXH bắt buộc tại thời điểm phát sinh chế độ.');
  if ((caseType === 'contraception_iud' || caseType === 'contraception_sterilization') && !Boolean(input.medicalProcedureFacility)) {
    activeEligibility.push('Biện pháp tránh thai phải được thực hiện tại cơ sở khám bệnh, chữa bệnh.');
  }
  if (activeEligibility.length) return { ...base, eligible: false, eligibilityRule: 'Phải thuộc đối tượng hưởng chế độ thai sản tại thời điểm phát sinh và đáp ứng điều kiện riêng của trường hợp.', eligibilityErrors: activeEligibility };

  const salaries = (input.salaryMonths || []).map(number).filter(v => v > 0).slice(0, 6);
  if (!salaries.length) return { ok: false, errors: ['Cần nhập mức tiền lương đóng BHXH bắt buộc gần nhất trước khi nghỉ hưởng thai sản.'] };
  const avgSalary = maternityAverage(salaries);
  const caseBase = { ...base, eligible: true, eligibilityErrors: [], averageSalary: avgSalary };

  if (caseType === 'prenatal') {
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(10, requested || 0);
    if (!days) return { ok: false, errors: ['Nhập số ngày nghỉ khám thai (tối đa 10 ngày làm việc).'] };
    const daily = avgSalary / 24;
    return { ...caseBase, eligibilityRule: 'Lao động nữ đang tham gia BHXH bắt buộc được nghỉ khám thai tối đa 05 lần, mỗi lần không quá 02 ngày làm việc.', durationDays: days, durationLabel: `${days} ngày làm việc`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: ['Mức một ngày bằng trợ cấp tháng chia 24.'] };
  }

  if (caseType === 'pregnancy_loss') {
    const weeks = Math.max(0, number(input.gestationWeeks));
    const maxDays = pregnancyLossMaxDays(weeks);
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(maxDays, requested || maxDays);
    const daily = avgSalary / 30;
    if (weeks >= 22) warnings.push('Thai từ đủ 22 tuần trở lên có trường hợp được hưởng như sinh con nếu đáp ứng điều kiện tại Điều 50; kết quả này đang tính theo số ngày nghỉ tối đa của Điều 52, cần đối chiếu hồ sơ thực tế.');
    return { ...caseBase, eligibilityRule: 'Lao động nữ đang tham gia BHXH bắt buộc và phát sinh trường hợp thai nghén thuộc Điều 52.', gestationWeeks: weeks, maxDays, durationDays: days, durationLabel: `${days} ngày`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: ['Thời gian nghỉ tối đa phụ thuộc tuổi thai; mức một ngày trong trường hợp Điều 52 bằng trợ cấp tháng chia 30.'] };
  }

  if (caseType === 'contraception_iud' || caseType === 'contraception_sterilization') {
    const maxDays = caseType === 'contraception_iud' ? 7 : 15;
    const requested = Math.max(0, Math.trunc(number(input.requestedDays)));
    const days = Math.min(maxDays, requested || maxDays);
    const daily = avgSalary / 30;
    return { ...caseBase, eligibilityRule: 'Đang tham gia BHXH bắt buộc và thực hiện biện pháp tránh thai tại cơ sở khám bệnh, chữa bệnh.', maxDays, durationDays: days, durationLabel: `${days} ngày`, dailyBenefit: daily, monthlyBenefit: avgSalary, lumpSum: 0, estimatedTotal: daily * days, notes: [`Thời gian nghỉ tối đa ${maxDays} ngày theo trường hợp đã chọn; mức một ngày tính theo trợ cấp tháng chia 30.`] };
  }

  return { ok: false, errors: ['Trường hợp thai sản chưa được hỗ trợ.'] };
}

export const BENEFIT_LABELS = {
  pension: 'Lương hưu',
  one_time: 'BHXH một lần',
  unemployment: 'Trợ cấp thất nghiệp',
  maternity: 'Chế độ thai sản'
};
