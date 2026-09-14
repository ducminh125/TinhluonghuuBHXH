import {
  adjustmentFactorForYear,
  baseSalaryForMonth,
  referenceLevelForMonth,
  stateAverageWindowMonths
} from "./rules.js";
import { addMonthsToYm, indexToYm, ymToIndex } from "./pension.js";
import { findSalaryScaleCandidates } from "./salary-scales.js";

const REGIMES = new Set(["state", "employer", "voluntary"]);
const VALUE_TYPES = new Set(["coefficient", "vnd"]);

function coefficientNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function percentNumber(value) {
  return Math.max(0, coefficientNumber(value));
}

function moneyNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const digits = String(value ?? "").replace(/[^0-9-]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function monthLabel(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "?";
  return `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
}

function validYm(ym) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ""));
}

function formatPeriodName(row, index) {
  return row.note?.trim() || `Dòng ${index + 1} (${monthLabel(row.from)}–${monthLabel(row.to)})`;
}

export function normalizeContributionRow(row) {
  return {
    from: String(row.from || "").slice(0, 7),
    to: String(row.to || "").slice(0, 7),
    regime: String(row.regime || ""),
    valueType: String(row.valueType || ""),
    coefficient: coefficientNumber(row.coefficient),
    amountVnd: moneyNumber(row.amountVnd),
    positionAllowanceCoeff: coefficientNumber(row.positionAllowanceCoeff),
    reservedDifferenceCoeff: coefficientNumber(row.reservedDifferenceCoeff),
    seniorityBeyondPercent: percentNumber(row.seniorityBeyondPercent),
    professionalSeniorityPercent: percentNumber(row.professionalSeniorityPercent),
    allowanceVnd: moneyNumber(row.allowanceVnd),
    projected: Boolean(row.projected),
    note: String(row.note || "").trim()
  };
}

/**
 * Quy đổi các khoản thuộc tiền lương đóng BHXH theo chế độ lương Nhà nước về
 * một "hệ số tương đương" để nhân với mức lương cơ sở / mức tham chiếu.
 *
 * - Phụ cấp chức vụ: hệ số phụ cấp × mức lương cơ sở.
 * - Phụ cấp thâm niên vượt khung: % × hệ số lương bậc hiện hưởng.
 * - Phụ cấp thâm niên nghề: % × (hệ số lương + PC chức vụ + TNVK quy hệ số).
 * - Chênh lệch bảo lưu: hệ số chênh lệch × mức lương cơ sở.
 */
export function stateContributionCoefficient(row) {
  const r = normalizeContributionRow(row);
  const salary = r.coefficient;
  const position = r.positionAllowanceCoeff;
  const beyond = salary * r.seniorityBeyondPercent / 100;
  const professional = (salary + position + beyond) * r.professionalSeniorityPercent / 100;
  return salary + position + beyond + professional + r.reservedDifferenceCoeff;
}

function financialSignature(row, { ignoreRegime = false } = {}) {
  const r = normalizeContributionRow(row);
  return JSON.stringify({
    regime: ignoreRegime ? undefined : r.regime,
    valueType: r.valueType,
    coefficient: r.coefficient,
    amountVnd: r.amountVnd,
    positionAllowanceCoeff: r.positionAllowanceCoeff,
    reservedDifferenceCoeff: r.reservedDifferenceCoeff,
    seniorityBeyondPercent: r.seniorityBeyondPercent,
    professionalSeniorityPercent: r.professionalSeniorityPercent,
    allowanceVnd: r.allowanceVnd
  });
}

function compactMonthRecords(months) {
  if (!months.length) return [];
  const sorted = [...months].sort((a, b) => ymToIndex(a.ym) - ymToIndex(b.ym));
  const result = [];
  let current = null;

  for (const item of sorted) {
    const signature = financialSignature(item);
    const contiguous = current && ymToIndex(item.ym) === ymToIndex(current.to) + 1;
    if (current && contiguous && current.__signature === signature) {
      current.to = item.ym;
      if (item.note && !current.note.includes(item.note)) {
        current.note = [current.note, item.note].filter(Boolean).join(" | ").slice(0, 240);
      }
      current.projected = current.projected && item.projected;
      continue;
    }

    if (current) {
      delete current.__signature;
      result.push(current);
    }
    current = { ...normalizeContributionRow(item), from: item.ym, to: item.ym, __signature: signature };
  }

  if (current) {
    delete current.__signature;
    result.push(current);
  }
  return result;
}

/**
 * Dùng cho dữ liệu AI/import: loại các tháng trùng hệt nhau do ảnh chụp gối trang.
 * Nếu cùng tháng nhưng số liệu khác nhau, giữ bản ghi xuất hiện trước và cảnh báo
 * để người dùng đối chiếu thay vì tự quyết định một con số.
 */
export function dedupeImportedPeriods(periods = []) {
  const monthMap = new Map();
  const warnings = [];
  let duplicatesRemoved = 0;
  let conflicts = 0;

  periods.map(normalizeContributionRow).forEach((row, index) => {
    if (!validYm(row.from) || !validYm(row.to) || ymToIndex(row.from) > ymToIndex(row.to)) {
      warnings.push(`Giai đoạn nhập tự động số ${index + 1} có mốc thời gian không hợp lệ và đã bỏ qua.`);
      return;
    }

    for (let idx = ymToIndex(row.from); idx <= ymToIndex(row.to); idx++) {
      const ym = indexToYm(idx);
      const candidate = { ...row, ym };
      const existing = monthMap.get(ym);
      if (!existing) {
        monthMap.set(ym, candidate);
        continue;
      }

      if (financialSignature(existing) === financialSignature(candidate)) {
        duplicatesRemoved += 1;
        continue;
      }

      const sameValues = financialSignature(existing, { ignoreRegime: true }) === financialSignature(candidate, { ignoreRegime: true });
      if (sameValues && existing.regime === "unknown" && candidate.regime !== "unknown") {
        monthMap.set(ym, candidate);
        duplicatesRemoved += 1;
        continue;
      }
      if (sameValues && candidate.regime === "unknown" && existing.regime !== "unknown") {
        duplicatesRemoved += 1;
        continue;
      }

      conflicts += 1;
      warnings.push(`Tháng ${monthLabel(ym)} xuất hiện nhiều giá trị khác nhau trong các ảnh/tệp. Web giữ bản ghi đọc được trước và yêu cầu đối chiếu lại tháng này.`);
    }
  });

  const compacted = compactMonthRecords([...monthMap.values()]);
  return {
    periods: compacted,
    warnings: [...new Set(warnings)],
    duplicatesRemoved,
    conflicts
  };
}

export function expandContributionPeriods(periods, retirementMonth = null) {
  const errors = [];
  const warnings = [];
  const monthMap = new Map();

  periods.map(normalizeContributionRow).forEach((row, index) => {
    const label = formatPeriodName(row, index);

    if (!validYm(row.from) || !validYm(row.to)) {
      errors.push(`${label}: tháng bắt đầu/kết thúc không hợp lệ.`);
      return;
    }
    if (ymToIndex(row.from) > ymToIndex(row.to)) {
      errors.push(`${label}: thời gian bắt đầu phải trước hoặc bằng thời gian kết thúc.`);
      return;
    }
    if (!REGIMES.has(row.regime)) {
      errors.push(`${label}: chưa xác định đúng chế độ tiền lương/thu nhập đóng BHXH.`);
      return;
    }
    if (!VALUE_TYPES.has(row.valueType)) {
      errors.push(`${label}: chưa chọn kiểu nhập hệ số hoặc tiền đồng.`);
      return;
    }
    if (row.regime !== "state" && row.valueType === "coefficient") {
      errors.push(`${label}: hệ số chỉ áp dụng cho tiền lương do Nhà nước quy định; các nhóm khác cần nhập số tiền VND.`);
      return;
    }
    if (row.valueType === "coefficient" && row.coefficient <= 0) {
      errors.push(`${label}: hệ số lương phải lớn hơn 0.`);
      return;
    }
    if (row.valueType === "vnd" && row.amountVnd <= 0) {
      errors.push(`${label}: mức tiền lương/thu nhập phải lớn hơn 0.`);
      return;
    }

    for (let idx = ymToIndex(row.from); idx <= ymToIndex(row.to); idx++) {
      const ym = indexToYm(idx);
      if (monthMap.has(ym)) {
        errors.push(`${label}: tháng ${monthLabel(ym)} bị trùng với một dòng quá trình đóng khác.`);
        continue;
      }
      if (retirementMonth && ymToIndex(ym) > ymToIndex(retirementMonth)) {
        warnings.push(`${label}: có thời gian đóng sau tháng nghỉ hưu dự kiến (${monthLabel(ym)}); tháng này không được đưa vào phép tính.`);
        continue;
      }
      monthMap.set(ym, { ...row, ym, sourceIndex: index });
    }
  });

  const months = [...monthMap.values()].sort((a, b) => ymToIndex(a.ym) - ymToIndex(b.ym));
  return { months, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function firstMonth(months, predicate = () => true) {
  return months.find(predicate)?.ym ?? null;
}

function adjustedMonthlyValue(record, context) {
  const contributionYear = Number(record.ym.slice(0, 4));
  const { factor, factorYear, provisional } = adjustmentFactorForYear(contributionYear, context.pensionYear);
  const warnings = [];
  let value = null;
  let method = "";
  let isProvisional = provisional;

  if (record.regime === "state") {
    if (context.firstCompulsoryYm < "2016-01") {
      const ref = referenceLevelForMonth(context.pensionStartMonth);
      if (Number(context.pensionStartMonth.slice(0, 4)) > 2026) isProvisional = true;

      if (record.valueType === "coefficient") {
        const totalCoeff = stateContributionCoefficient(record);
        value = totalCoeff * ref;
        method = `Tổng hệ số đóng BHXH (${totalCoeff.toFixed(4)}) × mức tham chiếu tại thời điểm hưởng`;
      } else {
        const historicalBase = baseSalaryForMonth(record.ym);
        if (!historicalBase) {
          return {
            value: null,
            error: `Tháng ${monthLabel(record.ym)} nằm trong phần lương Nhà nước được dùng để tính bình quân nhưng hồ sơ chỉ ghi VND ở giai đoạn trước 01/04/1993. Giai đoạn này phải chuyển xếp theo chế độ tiền lương lịch sử; cần bổ sung hệ số/ngạch bậc hoặc dữ liệu chuyển xếp để quy đổi chính xác.`
          };
        }
        const historicalTotal = record.amountVnd + record.allowanceVnd;
        const effectiveCoefficient = historicalTotal / historicalBase;
        value = effectiveCoefficient * ref;
        method = `Tổng tiền đóng → hệ số quy đổi (${effectiveCoefficient.toFixed(4)}) × mức tham chiếu`;
        warnings.push(`Tháng ${monthLabel(record.ym)} lương Nhà nước trước 2016 được quy đổi từ VND sang hệ số. Cần đối chiếu nếu hồ sơ có khoản tiền cố định không biến đổi theo lương cơ sở.`);
      }
    } else {
      if (factor == null) {
        return { value: null, error: `Chưa có hệ số điều chỉnh cho năm ${contributionYear}.` };
      }
      if (record.valueType === "coefficient") {
        const historicalBase = baseSalaryForMonth(record.ym);
        if (!historicalBase) {
          return { value: null, error: `Không tìm thấy mức lương cơ sở tại ${monthLabel(record.ym)} để quy đổi hệ số.` };
        }
        const totalCoeff = stateContributionCoefficient(record);
        value = totalCoeff * historicalBase * factor;
        method = `Tổng hệ số đóng BHXH × lương cơ sở lịch sử × hệ số điều chỉnh ${factorYear}`;
      } else {
        const total = record.amountVnd + record.allowanceVnd;
        value = total * factor;
        method = `Lương + phụ cấp tính đóng × hệ số điều chỉnh ${factorYear}`;
      }
    }
  } else if (record.regime === "employer") {
    if (record.valueType !== "vnd") {
      return { value: null, error: `Tháng ${monthLabel(record.ym)} phải nhập bằng VND.` };
    }
    if (factor == null) {
      return { value: null, error: `Chưa có hệ số điều chỉnh cho năm ${contributionYear}.` };
    }
    const total = record.amountVnd + record.allowanceVnd;
    value = total * factor;
    method = `Lương + phụ cấp/khoản bổ sung tính đóng × hệ số điều chỉnh ${factorYear}`;
  } else {
    if (record.valueType !== "vnd") {
      return { value: null, error: `Tháng ${monthLabel(record.ym)} phải nhập bằng VND.` };
    }
    if (factor == null) {
      return { value: null, error: `Chưa có hệ số điều chỉnh cho năm ${contributionYear}.` };
    }
    value = record.amountVnd * factor;
    method = `Thu nhập đóng × hệ số điều chỉnh ${factorYear}`;
  }

  if (isProvisional) {
    warnings.push(`Dữ liệu ${monthLabel(record.ym)} đang dùng bộ hệ số/mức tham chiếu mới nhất đã tích hợp; năm hưởng ${context.pensionYear} cần cập nhật khi có văn bản mới.`);
  }

  return { value, method, warnings, provisional: isProvisional };
}

function sum(items, selector = x => x) {
  return items.reduce((acc, item) => acc + selector(item), 0);
}

function lastValidPeriod(periods) {
  return periods
    .map(normalizeContributionRow)
    .filter(row => validYm(row.from) && validYm(row.to) && ymToIndex(row.from) <= ymToIndex(row.to))
    .sort((a, b) => ymToIndex(b.to) - ymToIndex(a.to))[0] || null;
}

function stateCoefficientTimeline(periods = []) {
  const monthMap = new Map();
  periods.map(normalizeContributionRow).forEach((row, sourceIndex) => {
    if (row.regime !== "state" || row.valueType !== "coefficient" || row.coefficient <= 0) return;
    if (!validYm(row.from) || !validYm(row.to) || ymToIndex(row.from) > ymToIndex(row.to)) return;
    for (let idx = ymToIndex(row.from); idx <= ymToIndex(row.to); idx++) {
      monthMap.set(indexToYm(idx), { ym: indexToYm(idx), coefficient: row.coefficient, sourceIndex });
    }
  });
  return [...monthMap.values()].sort((a, b) => ymToIndex(a.ym) - ymToIndex(b.ym));
}

function coefficientSegments(periods = []) {
  const timeline = stateCoefficientTimeline(periods);
  const segments = [];
  for (const item of timeline) {
    const last = segments[segments.length - 1];
    const contiguous = last && ymToIndex(item.ym) === ymToIndex(last.to) + 1;
    const same = last && Math.abs(last.coefficient - item.coefficient) <= 0.0001;
    if (contiguous && same) {
      last.to = item.ym;
    } else {
      segments.push({ from: item.ym, to: item.ym, coefficient: item.coefficient });
    }
  }
  return segments;
}

function scaleSequenceScore(scale, recentSegments) {
  if (!recentSegments.length) return -1;
  const current = recentSegments[recentSegments.length - 1];
  const currentIndex = scale.coefficients.findIndex(x => Math.abs(x - current.coefficient) <= 0.005);
  if (currentIndex < 0) return -1;

  let score = 1;
  let scaleIndex = currentIndex;
  for (let i = recentSegments.length - 2; i >= 0 && scaleIndex > 0; i--) {
    const prev = recentSegments[i];
    if (Math.abs(scale.coefficients[scaleIndex - 1] - prev.coefficient) <= 0.005) {
      score += 2;
      scaleIndex -= 1;
    } else if (Math.abs(scale.coefficients[scaleIndex] - prev.coefficient) <= 0.005) {
      score += 0.2;
    } else {
      break;
    }
  }
  return score;
}

/**
 * Tự nhận diện thông số nâng bậc từ lịch sử hệ số lương Nhà nước.
 * - Tháng bắt đầu bậc hiện tại: tháng đầu tiên của chuỗi liên tục có hệ số hiện tại.
 * - Chu kỳ: ưu tiên khoảng cách quan sát được giữa các lần đổi hệ số nếu khớp 24/36/60;
 *   nếu không, dùng chu kỳ của thang hệ số nhận diện được.
 * - Mức tăng và hệ số tối đa: lấy từ thang hệ số nếu nhận diện đủ chắc chắn.
 *
 * Không ép chọn thang lương khi một hệ số hiện tại thuộc nhiều thang mà lịch sử không
 * đủ phân biệt; trường hợp này trả warning để người dùng kiểm tra.
 */
export function inferStateSalaryProgression(periods = []) {
  const segments = coefficientSegments(periods);
  if (!segments.length) {
    return { applicable: false, confidence: "none", warnings: ["Chưa có lịch sử lương Nhà nước theo hệ số để tự xác định thông số nâng bậc."] };
  }

  const current = segments[segments.length - 1];
  const recent = segments.slice(-4);
  const candidates = findSalaryScaleCandidates(current.coefficient)
    .map(item => ({ ...item, score: scaleSequenceScore(item.scale, recent) }))
    .sort((a, b) => b.score - a.score);

  let chosen = null;
  if (candidates.length === 1) {
    chosen = candidates[0];
  } else if (candidates.length > 1 && candidates[0].score > candidates[1].score + 0.5) {
    chosen = candidates[0];
  }

  const observedCadences = [];
  for (let i = Math.max(1, segments.length - 4); i < segments.length; i++) {
    const diff = ymToIndex(segments[i].from) - ymToIndex(segments[i - 1].from);
    if ([24, 36, 60].includes(diff)) observedCadences.push(diff);
  }
  const observedCadence = observedCadences.length && observedCadences.every(x => x === observedCadences[0])
    ? observedCadences[0]
    : null;

  const warnings = [];
  let coefficientStep = 0;
  let maxCoefficient = 0;
  let gradeNumber = null;
  let scaleName = null;
  let cadenceMonths = observedCadence || chosen?.scale?.cadenceMonths || 0;

  if (chosen) {
    const coeffs = chosen.scale.coefficients;
    gradeNumber = chosen.index + 1;
    scaleName = chosen.scale.name;
    maxCoefficient = coeffs[coeffs.length - 1];
    if (chosen.index < coeffs.length - 1) coefficientStep = Number((coeffs[chosen.index + 1] - coeffs[chosen.index]).toFixed(4));
    else if (chosen.index > 0) coefficientStep = Number((coeffs[chosen.index] - coeffs[chosen.index - 1]).toFixed(4));
    if (observedCadence && observedCadence !== chosen.scale.cadenceMonths) {
      warnings.push(`Lịch sử cho thấy chu kỳ đổi hệ số gần nhất là ${observedCadence} tháng, khác chu kỳ thông thường ${chosen.scale.cadenceMonths} tháng của nhóm ${chosen.scale.name}; web ưu tiên lịch sử thực tế để dự báo.`);
    }
  } else if (candidates.length > 1) {
    warnings.push(`Hệ số hiện tại ${current.coefficient.toFixed(2)} xuất hiện ở nhiều thang lương; lịch sử chưa đủ để tự xác định chắc chắn mức tăng và hệ số tối đa.`);
  } else {
    warnings.push(`Hệ số hiện tại ${current.coefficient.toFixed(2)} chưa khớp các thang hệ số phổ biến đã tích hợp; web chỉ dùng mốc thay đổi hệ số quan sát được nếu có.`);
  }

  if (!cadenceMonths) {
    warnings.push("Chưa đủ căn cứ tự xác định chu kỳ nâng bậc 24/36/60 tháng từ lịch sử hệ số.");
  }

  return {
    applicable: true,
    currentCoefficient: current.coefficient,
    gradeStartMonth: current.from,
    raiseCadenceMonths: cadenceMonths,
    coefficientStep,
    maxCoefficient,
    scaleId: chosen?.scale?.id || null,
    scaleName,
    gradeNumber,
    atMax: Boolean(chosen && chosen.index === chosen.scale.coefficients.length - 1),
    confidence: chosen ? (recent.length >= 2 ? "high" : "medium") : (observedCadence ? "partial" : "low"),
    observedChanges: segments.map(x => ({ ...x })),
    warnings
  };
}

/**
 * Tạo các giai đoạn giả định từ tháng sau giai đoạn đóng cuối cùng đến tháng nghỉ hưu.
 * - Nếu nhập VND: giữ nguyên mức tiền hiện tại (và phụ cấp VND nếu là lương doanh nghiệp).
 * - Nếu lương Nhà nước theo hệ số: dự kiến nâng bậc theo thông số đã được tự nhận diện
 *   từ lịch sử đổi hệ số/thang hệ số hoặc được người dùng hiệu chỉnh. Không ép suy đoán
 *   khi dữ liệu lịch sử không đủ phân biệt ngạch/thang lương.
 */
export function buildProjectedPeriods(periods, retirementMonth, options = {}) {
  const warnings = [];
  const latest = lastValidPeriod(periods);
  if (!latest || !validYm(retirementMonth)) {
    return { periods: [], warnings, monthsAdded: 0 };
  }

  const start = addMonthsToYm(latest.to, 1);
  if (ymToIndex(start) > ymToIndex(retirementMonth)) {
    return { periods: [], warnings, monthsAdded: 0 };
  }

  const monthsAdded = ymToIndex(retirementMonth) - ymToIndex(start) + 1;
  if (latest.valueType === "vnd") {
    return {
      periods: [{
        ...latest,
        from: start,
        to: retirementMonth,
        projected: true,
        note: "Dự kiến tự bổ sung đến tháng nghỉ hưu theo mức đóng bằng tiền hiện tại"
      }],
      warnings,
      monthsAdded
    };
  }

  if (latest.regime !== "state" || latest.valueType !== "coefficient") {
    warnings.push("Không thể tự tăng hệ số cho dòng đóng cuối cùng vì dòng này không phải lương Nhà nước nhập bằng hệ số.");
    return { periods: [], warnings, monthsAdded: 0 };
  }

  const cadenceMonths = Number(options.raiseCadenceMonths || 0);
  const coefficientStep = coefficientNumber(options.coefficientStep);
  const maxCoefficient = coefficientNumber(options.maxCoefficient) || Infinity;
  const gradeStartMonth = validYm(options.gradeStartMonth) ? options.gradeStartMonth : null;
  let nextRaiseMonth = gradeStartMonth && cadenceMonths > 0 ? addMonthsToYm(gradeStartMonth, cadenceMonths) : null;
  let currentCoefficient = latest.coefficient;

  if (!gradeStartMonth || ![24, 36, 60].includes(cadenceMonths) || coefficientStep <= 0) {
    warnings.push("Chưa đủ dữ liệu để tự nhận diện đầy đủ lịch nâng bậc; web giữ nguyên hệ số hiện tại đến nghỉ hưu. Có thể kiểm tra hoặc hiệu chỉnh tháng bắt đầu bậc, chu kỳ và mức tăng nếu hồ sơ có quyết định xếp/nâng bậc riêng.");
    nextRaiseMonth = null;
  }

  // Nếu mốc nâng bậc đầu tiên đã nằm trong phần dữ liệu thực tế, dịch đến kỳ tiếp theo.
  while (nextRaiseMonth && ymToIndex(nextRaiseMonth) <= ymToIndex(latest.to)) {
    nextRaiseMonth = addMonthsToYm(nextRaiseMonth, cadenceMonths);
  }

  const monthly = [];
  for (let idx = ymToIndex(start); idx <= ymToIndex(retirementMonth); idx++) {
    const ym = indexToYm(idx);
    if (nextRaiseMonth && ymToIndex(ym) >= ymToIndex(nextRaiseMonth) && currentCoefficient < maxCoefficient) {
      currentCoefficient = Math.min(maxCoefficient, currentCoefficient + coefficientStep);
      nextRaiseMonth = addMonthsToYm(nextRaiseMonth, cadenceMonths);
    }
    monthly.push({
      ...latest,
      ym,
      coefficient: Number(currentCoefficient.toFixed(4)),
      projected: true,
      note: "Dự kiến tự bổ sung đến tháng nghỉ hưu theo lịch nâng bậc tự nhận diện/đã hiệu chỉnh"
    });
  }

  return { periods: compactMonthRecords(monthly), warnings, monthsAdded };
}

export function calculateAverageBase(periods, { retirementMonth, pensionStartMonth = null } = {}) {
  const startMonth = pensionStartMonth || (retirementMonth ? addMonthsToYm(retirementMonth, 1) : null);
  if (!retirementMonth || !startMonth) {
    return { ok: false, errors: ["Chưa xác định được tháng nghỉ hưu/tháng bắt đầu hưởng lương hưu."], warnings: [] };
  }

  const expanded = expandContributionPeriods(periods, retirementMonth);
  const errors = [...expanded.errors];
  const warnings = [...expanded.warnings];
  const months = expanded.months;

  if (!months.length) {
    errors.push("Chưa có dữ liệu quá trình đóng BHXH hợp lệ.");
    return { ok: false, errors, warnings, totalMonths: 0, compulsoryMonths: 0, voluntaryMonths: 0 };
  }

  const compulsory = months.filter(m => m.regime === "state" || m.regime === "employer");
  const stateMonths = months.filter(m => m.regime === "state");
  const employerMonths = months.filter(m => m.regime === "employer");
  const voluntaryMonthsList = months.filter(m => m.regime === "voluntary");
  const projectedMonths = months.filter(m => m.projected);
  const firstCompulsoryYm = firstMonth(compulsory);
  const pensionYear = Number(startMonth.slice(0, 4));
  const context = { firstCompulsoryYm, pensionStartMonth: startMonth, pensionYear };

  // Chọn đúng số tháng lương Nhà nước dùng để tính bình quân TRƯỚC khi quy đổi.
  // Nhờ đó các tháng rất cũ nằm ngoài cửa sổ 5/6/8/10/15/20 năm không thể làm
  // phép tính dừng chỉ vì dữ liệu lịch sử của tháng đó không đủ để chuyển đổi.
  let stateWindow = null;
  let selectedStateMonths = [];
  if (stateMonths.length) {
    const windowMonths = stateAverageWindowMonths(firstCompulsoryYm);
    const stateSortedDesc = [...stateMonths].sort((a, b) => ymToIndex(b.ym) - ymToIndex(a.ym));
    selectedStateMonths = windowMonths ? stateSortedDesc.slice(0, windowMonths) : stateSortedDesc;
    stateWindow = {
      prescribedMonths: windowMonths,
      usedMonths: selectedStateMonths.length,
      from: selectedStateMonths.length ? selectedStateMonths[selectedStateMonths.length - 1].ym : null,
      to: selectedStateMonths.length ? selectedStateMonths[0].ym : null
    };
    if (windowMonths && selectedStateMonths.length < windowMonths) {
      warnings.push(`Dữ liệu lương Nhà nước hiện chỉ có ${selectedStateMonths.length}/${windowMonths} tháng cần thiết để tính bình quân theo mốc bắt đầu tham gia. Kết quả chỉ phản ánh dữ liệu đã nhập.`);
    }
  }

  const selectedStateSet = new Set(selectedStateMonths.map(m => m.ym));
  const adjusted = months.map(record => {
    if (record.regime === "state" && !selectedStateSet.has(record.ym)) {
      return {
        record,
        value: null,
        method: "Không thuộc số tháng lương Nhà nước được chọn để tính bình quân",
        skipped: true,
        provisional: false,
        warnings: []
      };
    }
    return { record, ...adjustedMonthlyValue(record, context) };
  });

  for (const item of adjusted) {
    if (item.skipped) continue;
    if (item.error) errors.push(item.error);
    if (item.warnings?.length) warnings.push(...item.warnings);
  }

  if (errors.length) {
    return {
      ok: false,
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)],
      totalMonths: months.length,
      compulsoryMonths: compulsory.length,
      voluntaryMonths: voluntaryMonthsList.length,
      projectedMonths: projectedMonths.length,
      stateWindow
    };
  }

  const byYm = new Map(adjusted.map(item => [item.record.ym, item]));
  let compulsoryAverage = 0;
  let stateAverage = null;

  if (compulsory.length) {
    if (selectedStateMonths.length) {
      stateAverage = sum(selectedStateMonths, m => byYm.get(m.ym).value) / selectedStateMonths.length;
    }

    if (stateMonths.length && employerMonths.length) {
      const employerAdjustedSum = sum(employerMonths, m => byYm.get(m.ym).value);
      compulsoryAverage = (stateAverage * stateMonths.length + employerAdjustedSum) / compulsory.length;
    } else if (stateMonths.length) {
      compulsoryAverage = stateAverage;
    } else {
      compulsoryAverage = sum(employerMonths, m => byYm.get(m.ym).value) / employerMonths.length;
    }
  }

  const voluntaryAdjustedSum = sum(voluntaryMonthsList, m => byYm.get(m.ym).value);
  let averageBase;
  if (compulsory.length && voluntaryMonthsList.length) {
    averageBase = (compulsoryAverage * compulsory.length + voluntaryAdjustedSum) / months.length;
  } else if (compulsory.length) {
    averageBase = compulsoryAverage;
  } else {
    averageBase = voluntaryAdjustedSum / voluntaryMonthsList.length;
  }

  const usedAdjusted = adjusted.filter(x => !x.skipped);
  const provisional = usedAdjusted.some(x => x.provisional) || pensionYear > 2026 || projectedMonths.length > 0;
  if (pensionYear > 2026) {
    warnings.push(`Năm bắt đầu hưởng ${pensionYear} chưa có đầy đủ hệ số điều chỉnh/mức tham chiếu tương lai trong bộ dữ liệu. Phần tương lai được tính theo dữ liệu pháp lý mới nhất đã tích hợp.`);
  }
  if (projectedMonths.length) {
    warnings.push(`Có ${projectedMonths.length} tháng đóng BHXH tương lai do người dùng chọn tự bổ sung; đây là giả định để ước tính.`);
  }

  return {
    ok: true,
    errors: [],
    warnings: [...new Set(warnings)],
    totalMonths: months.length,
    compulsoryMonths: compulsory.length,
    voluntaryMonths: voluntaryMonthsList.length,
    stateMonths: stateMonths.length,
    employerMonths: employerMonths.length,
    projectedMonths: projectedMonths.length,
    firstCompulsoryYm,
    averageBase,
    compulsoryAverage: compulsory.length ? compulsoryAverage : null,
    stateAverage,
    stateWindow,
    pensionStartMonth: startMonth,
    pensionYear,
    provisional,
    monthlyRecords: adjusted.map(item => ({
      ym: item.record.ym,
      regime: item.record.regime,
      input: item.record.valueType === "coefficient" ? item.record.coefficient : item.record.amountVnd,
      valueType: item.record.valueType,
      adjustedValue: item.value,
      method: item.method,
      skipped: Boolean(item.skipped),
      projected: item.record.projected
    }))
  };
}

export function compactDuration(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years} năm${months ? ` ${months} tháng` : ""}`;
}
