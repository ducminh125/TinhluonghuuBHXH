import {
  adjustmentFactorForYear,
  baseSalaryForMonth,
  referenceLevelForMonth,
  stateAverageWindowMonths
} from "./rules.js";
import { addMonthsToYm, indexToYm, ymToIndex } from "./pension.js";

const REGIMES = new Set(["state", "employer", "voluntary"]);
const VALUE_TYPES = new Set(["coefficient", "vnd"]);

function coefficientNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
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
    note: String(row.note || "").trim()
  };
}

export function expandContributionPeriods(periods, retirementMonth = null) {
  const errors = [];
  const warnings = [];
  const monthMap = new Map();

  periods.map(normalizeContributionRow).forEach((row, index) => {
    const label = formatPeriodName(row, index);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.from) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.to)) {
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
      errors.push(`${label}: hệ số đóng BHXH phải lớn hơn 0.`);
      return;
    }
    if (row.valueType === "vnd" && row.amountVnd <= 0) {
      errors.push(`${label}: mức tiền đóng BHXH phải lớn hơn 0.`);
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
        value = record.coefficient * ref;
        method = `Hệ số × mức tham chiếu tại thời điểm hưởng (${ref.toLocaleString("vi-VN")} đ)`;
      } else {
        const historicalBase = baseSalaryForMonth(record.ym);
        if (!historicalBase) {
          return {
            value: null,
            error: `Tháng ${monthLabel(record.ym)} thuộc chế độ lương Nhà nước trước 2016 nhưng nhập bằng VND và chưa có mức lương cơ sở lịch sử trong bộ dữ liệu. Hãy nhập bằng hệ số để tính minh bạch.`
          };
        }
        const effectiveCoefficient = record.amountVnd / historicalBase;
        value = effectiveCoefficient * ref;
        method = `VND → hệ số quy đổi (${effectiveCoefficient.toFixed(4)}) × mức tham chiếu`;
        warnings.push(`Tháng ${monthLabel(record.ym)} lương Nhà nước trước 2016 được quy đổi VND/hệ số lương cơ sở. Nếu số tiền có khoản cố định không tính theo lương cơ sở, cần đối chiếu hồ sơ BHXH.`);
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
        value = record.coefficient * historicalBase * factor;
        method = `Hệ số × lương cơ sở lịch sử × hệ số điều chỉnh ${factorYear}`;
      } else {
        value = record.amountVnd * factor;
        method = `Tiền đóng × hệ số điều chỉnh ${factorYear}`;
      }
    }
  } else {
    if (record.valueType !== "vnd") {
      return { value: null, error: `Tháng ${monthLabel(record.ym)} phải nhập bằng VND.` };
    }
    if (factor == null) {
      return { value: null, error: `Chưa có hệ số điều chỉnh cho năm ${contributionYear}.` };
    }
    value = record.amountVnd * factor;
    method = `${record.regime === "voluntary" ? "Thu nhập" : "Tiền lương"} đóng × hệ số điều chỉnh ${factorYear}`;
  }

  if (isProvisional) {
    warnings.push(`Kết quả tại ${monthLabel(record.ym)} đang tạm dùng bộ hệ số điều chỉnh năm ${factorYear}; năm hưởng ${context.pensionYear} cần cập nhật khi cơ quan có thẩm quyền ban hành hệ số mới.`);
  }

  return { value, method, warnings, provisional: isProvisional };
}

function sum(items, selector = x => x) {
  return items.reduce((acc, item) => acc + selector(item), 0);
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
  const firstCompulsoryYm = firstMonth(compulsory);
  const pensionYear = Number(startMonth.slice(0, 4));

  const context = { firstCompulsoryYm, pensionStartMonth: startMonth, pensionYear };
  const adjusted = months.map(record => ({ record, ...adjustedMonthlyValue(record, context) }));
  for (const item of adjusted) {
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
      voluntaryMonths: voluntaryMonthsList.length
    };
  }

  const byYm = new Map(adjusted.map(item => [item.record.ym, item]));
  let compulsoryAverage = 0;
  let stateAverage = null;
  let stateWindow = null;

  if (compulsory.length) {
    if (stateMonths.length) {
      const windowMonths = stateAverageWindowMonths(firstCompulsoryYm);
      const stateSortedDesc = [...stateMonths].sort((a, b) => ymToIndex(b.ym) - ymToIndex(a.ym));
      const selected = windowMonths ? stateSortedDesc.slice(0, windowMonths) : stateSortedDesc;
      stateAverage = sum(selected, m => byYm.get(m.ym).value) / selected.length;
      stateWindow = {
        prescribedMonths: windowMonths,
        usedMonths: selected.length,
        from: selected.length ? selected[selected.length - 1].ym : null,
        to: selected.length ? selected[0].ym : null
      };
      if (windowMonths && selected.length < windowMonths) {
        warnings.push(`Dữ liệu lương Nhà nước hiện chỉ có ${selected.length}/${windowMonths} tháng cần thiết để tính bình quân theo mốc bắt đầu tham gia. Kết quả chỉ phản ánh dữ liệu đã nhập.`);
      }
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

  const provisional = adjusted.some(x => x.provisional) || pensionYear > 2026;
  if (pensionYear > 2026) {
    warnings.push(`Năm bắt đầu hưởng ${pensionYear} là năm tương lai so với bộ dữ liệu hệ số hiện có (2026). Mức bình quân và lương hưu chỉ là tạm tính cho đến khi có hệ số/mức tham chiếu của năm hưởng.`);
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
      method: item.method
    }))
  };
}

export function compactDuration(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years} năm${months ? ` ${months} tháng` : ""}`;
}
