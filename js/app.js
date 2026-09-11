import { LAW_META, formatAgeMonths, normalRetirementAgeMonthsForYear } from "./rules.js";
import {
  calculatePension,
  earliestRetirementMonthForCase,
  pensionStartMonthFromStatutoryMonth,
  statutoryRetirementAttainmentMonth
} from "./pension.js";
import { calculateAverageBase, compactDuration } from "./contributions.js";

const $ = id => document.getElementById(id);
const form = $("calculatorForm");
const resultBox = $("resultBox");
const rowsHost = $("periodRows");
const rowTemplate = $("periodRowTemplate");
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

$("lawVersion").textContent = `${LAW_META.law} · ${LAW_META.decree} · dữ liệu cập nhật ${LAW_META.updatedAt}`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayMonth(ym) {
  if (!ym) return "—";
  return `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
}

function valueLabel(regime, valueType) {
  if (regime === "state" && valueType === "coefficient") {
    return { placeholder: "VD: 4.98", unit: "hệ số đóng BHXH", step: "0.01" };
  }
  return { placeholder: "VD: 12000000", unit: "VND/tháng", step: "1000" };
}

function syncPeriodRow(tr) {
  const regime = tr.querySelector('[data-field="regime"]');
  const valueType = tr.querySelector('[data-field="valueType"]');
  const value = tr.querySelector('[data-field="value"]');
  const unit = tr.querySelector(".value-unit");

  if (regime.value !== "state") valueType.value = "vnd";
  for (const option of valueType.options) {
    option.disabled = regime.value !== "state" && option.value === "coefficient";
  }

  const meta = valueLabel(regime.value, valueType.value);
  value.placeholder = meta.placeholder;
  value.step = meta.step;
  unit.textContent = meta.unit;
}

function addPeriodRow(data = {}) {
  const fragment = rowTemplate.content.cloneNode(true);
  const tr = fragment.querySelector("tr");
  const set = (field, value) => {
    const el = tr.querySelector(`[data-field="${field}"]`);
    if (el && value != null && value !== "") el.value = value;
  };

  set("from", data.from);
  set("to", data.to);
  set("regime", data.regime || "state");
  set("valueType", data.valueType || (data.regime === "state" ? "coefficient" : "vnd"));
  set("value", data.valueType === "coefficient" ? data.coefficient : data.amountVnd);
  set("note", data.note);

  tr.querySelector('[data-field="regime"]').addEventListener("change", () => syncPeriodRow(tr));
  tr.querySelector('[data-field="valueType"]').addEventListener("change", () => syncPeriodRow(tr));
  tr.querySelector(".remove-row").addEventListener("click", () => {
    tr.remove();
    if (!rowsHost.children.length) addPeriodRow();
  });

  syncPeriodRow(tr);
  rowsHost.appendChild(fragment);
}

function getPeriods() {
  return [...rowsHost.querySelectorAll(".period-row")].map(tr => {
    const get = field => tr.querySelector(`[data-field="${field}"]`)?.value ?? "";
    const regime = get("regime");
    const valueType = get("valueType");
    const numericValue = Number(get("value") || 0);
    return {
      from: get("from"),
      to: get("to"),
      regime,
      valueType,
      coefficient: valueType === "coefficient" ? numericValue : null,
      amountVnd: valueType === "vnd" ? numericValue : null,
      note: get("note")
    };
  });
}

function updateRetirementDates({ resetSpecial = false } = {}) {
  const sex = $("sex").value;
  const birthDate = $("birthDate").value;
  const statutory = sex && birthDate ? statutoryRetirementAttainmentMonth(birthDate, sex) : null;
  $("statutoryRetirementMonth").value = statutory || "";
  $("statutoryPensionStart").value = statutory ? pensionStartMonthFromStatutoryMonth(statutory) : "";

  const retirementCase = $("retirementCase").value;
  if (retirementCase !== "normal" && sex && birthDate) {
    const earliest = earliestRetirementMonthForCase(birthDate, sex, retirementCase);
    const actual = $("actualRetirementMonth");
    if (resetSpecial || !actual.value) actual.value = earliest || statutory || "";
    $("earliestMonthHint").textContent = earliest
      ? `Mốc tuổi sớm nhất theo nhóm đã chọn: ${displayMonth(earliest)}. Điều kiện thời gian đóng vẫn phải được kiểm tra.`
      : "Trường hợp này không thể xác định chỉ từ ngày sinh; cần nhập tháng nghỉ thực tế theo hồ sơ.";
  }
}

function updateRetirementCase() {
  const c = $("retirementCase").value;
  $("actualRetirementBlock").hidden = c === "normal";
  $("specialBlock").hidden = !["heavy", "coal", "specialImpairment"].includes(c);
  $("impairmentBlock").hidden = !["impairment61", "impairment81", "specialImpairment"].includes(c);
  updateRetirementDates({ resetSpecial: true });
}

$("sex").addEventListener("change", () => updateRetirementDates({ resetSpecial: true }));
$("birthDate").addEventListener("change", () => updateRetirementDates({ resetSpecial: true }));
$("retirementCase").addEventListener("change", updateRetirementCase);
$("addPeriodBtn").addEventListener("click", () => addPeriodRow());

function setImportStatus(type, html) {
  $("importStatus").innerHTML = `<div class="alert ${type}">${html}</div>`;
}

$("historyFile").addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (file) setImportStatus("warning", `Đã chọn <strong>${escapeHtml(file.name)}</strong>. Bấm “Đọc hồ sơ bằng AI” để trích xuất.`);
});

$("importAiBtn").addEventListener("click", async () => {
  const file = $("historyFile").files?.[0];
  if (!file) {
    setImportStatus("error", "Hãy chọn một file PDF, Word hoặc Excel trước.");
    return;
  }

  const btn = $("importAiBtn");
  btn.disabled = true;
  btn.textContent = "Đang đọc hồ sơ…";
  setImportStatus("warning", "Đang trích xuất dữ liệu. File được gửi tới backend, backend mới gọi ShopAIKey; API key không đi xuống trình duyệt.");

  try {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/import", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    if (payload.person?.sex && !$("sex").value) $("sex").value = payload.person.sex;
    if (payload.person?.birthDate && !$("birthDate").value) $("birthDate").value = payload.person.birthDate;
    updateRetirementDates({ resetSpecial: true });

    if (Array.isArray(payload.periods) && payload.periods.length) {
      rowsHost.innerHTML = "";
      payload.periods.forEach(addPeriodRow);
    }

    const warnings = payload.warnings?.length
      ? `<ul>${payload.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : "";
    setImportStatus("success", `<strong>Đã trích xuất ${payload.periods?.length || 0} giai đoạn.</strong> Hãy đối chiếu số liệu trước khi tính.${warnings}`);
  } catch (error) {
    const extra = location.protocol === "file:" || ["github.io"].some(x => location.hostname.endsWith(x))
      ? " Bản có AI cần chạy bằng server Node/Vercel; GitHub Pages thuần tĩnh không thể giữ bí mật API key."
      : "";
    setImportStatus("error", `<strong>Không nhập được file:</strong> ${escapeHtml(error.message)}.${extra}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Đọc hồ sơ bằng AI";
  }
});

function renderResult(avg, result, input) {
  const status = result.eligible ? "success" : "error";
  const statusBody = result.eligible
    ? `<strong>Đủ điều kiện theo dữ liệu đã nhập.</strong> Mức dưới đây được tính từ lịch sử đóng đã khai báo.`
    : `<strong>Chưa đủ điều kiện theo dữ liệu đã nhập.</strong><ul>${result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;

  const warningHtml = avg.warnings.length
    ? `<div class="alert warning"><strong>${avg.provisional ? "Kết quả đang tạm tính." : "Có điểm cần kiểm tra."}</strong><ul>${avg.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
    : "";

  const retirementYear = Number(input.retirementMonth.slice(0, 4));
  const normalAge = formatAgeMonths(normalRetirementAgeMonthsForYear(input.sex, retirementYear));
  const stateWindowText = avg.stateWindow
    ? (avg.stateWindow.prescribedMonths
      ? `${avg.stateWindow.usedMonths} tháng gần nhất trong dữ liệu lương Nhà nước (mốc pháp lý: ${avg.stateWindow.prescribedMonths} tháng)`
      : `toàn bộ ${avg.stateWindow.usedMonths} tháng lương Nhà nước`)
    : "không áp dụng";

  resultBox.innerHTML = `
    <div class="alert ${status}">${statusBody}</div>
    ${warningHtml}
    <div class="result-grid">
      <article class="metric primary">
        <span>${result.eligible ? "Lương hưu ước tính/tháng" : "Mức theo công thức nếu đủ điều kiện"}</span>
        <strong>${money.format(result.monthlyPension)}</strong>
        <small>${avg.provisional ? "TẠM TÍNH — cần cập nhật hệ số/mức tham chiếu của năm hưởng" : "Theo bộ quy tắc và hệ số đang tích hợp"}</small>
      </article>
      <article class="metric"><span>Mức bình quân tự tính</span><strong>${money.format(avg.averageBase)}</strong></article>
      <article class="metric"><span>Tỷ lệ hưởng cuối cùng</span><strong>${number.format(result.finalRate)}%</strong></article>
      <article class="metric"><span>Tổng thời gian đóng</span><strong>${compactDuration(avg.totalMonths)}</strong></article>
      <article class="metric"><span>BHXH bắt buộc</span><strong>${compactDuration(avg.compulsoryMonths)}</strong></article>
      <article class="metric"><span>BHXH tự nguyện</span><strong>${compactDuration(avg.voluntaryMonths)}</strong></article>
      <article class="metric"><span>Tỷ lệ trước giảm trừ</span><strong>${number.format(result.baseRate)}%</strong></article>
      <article class="metric"><span>Giảm do nghỉ trước tuổi</span><strong>${number.format(result.reduction)}%</strong></article>
    </div>

    <div class="explain">
      <h3>Giải trình thời điểm</h3>
      <p>Tuổi nghỉ hưu thông thường áp dụng tại năm ${retirementYear}: <strong>${normalAge}</strong>. Tháng đủ tuổi theo ngày sinh/giới tính: <strong>${displayMonth(result.statutoryMonth)}</strong>.</p>
      <p>Tháng nghỉ dùng để tính: <strong>${displayMonth(input.retirementMonth)}</strong>; tháng bắt đầu hưởng: <strong>${displayMonth(result.pensionStartMonth)}</strong>.</p>
      ${result.caseEarliestMonth && input.retirementCase !== "normal" ? `<p>Mốc tuổi sớm nhất của nhóm đã chọn: <strong>${displayMonth(result.caseEarliestMonth)}</strong>.</p>` : ""}
      ${result.notes.length ? `<ul>${result.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>` : ""}
    </div>

    <div class="explain">
      <h3>Giải trình mức bình quân</h3>
      <p>Tháng bắt đầu tham gia BHXH bắt buộc trong dữ liệu: <strong>${displayMonth(avg.firstCompulsoryYm)}</strong>. Phần lương Nhà nước sử dụng: <strong>${stateWindowText}</strong>.</p>
      ${avg.compulsoryAverage != null ? `<p>Mức bình quân phần BHXH bắt buộc: <strong>${money.format(avg.compulsoryAverage)}</strong>.</p>` : ""}
      ${avg.stateAverage != null ? `<p>Bình quân riêng phần lương Nhà nước: <strong>${money.format(avg.stateAverage)}</strong>.</p>` : ""}
      <p>Công thức tỷ lệ: <strong>${number.format(result.baseRate)}%</strong>${result.reduction ? ` − ${number.format(result.reduction)}% giảm trừ` : ""} = <strong>${number.format(result.finalRate)}%</strong>.</p>
      <p>Lương hưu trước kiểm tra mức tối thiểu: <strong>${money.format(result.rawMonthly)}</strong>${result.floorApplicable ? `; mức tham chiếu dùng kiểm tra: <strong>${money.format(result.referenceLevel)}</strong>` : ""}.</p>
    </div>
  `;
  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const sex = $("sex").value;
  const birthDate = $("birthDate").value;
  const retirementCase = $("retirementCase").value;
  const statutoryMonth = $("statutoryRetirementMonth").value;
  const retirementMonth = retirementCase === "normal" ? statutoryMonth : $("actualRetirementMonth").value;

  if (!sex || !birthDate || !statutoryMonth) {
    resultBox.innerHTML = `<div class="alert error">Vui lòng nhập giới tính và ngày sinh hợp lệ để hệ thống xác định tháng nghỉ hưu.</div>`;
    return;
  }
  if (!retirementMonth) {
    resultBox.innerHTML = `<div class="alert error">Trường hợp nghỉ hưu đặc thù cần có tháng nghỉ hưu thực tế theo hồ sơ.</div>`;
    return;
  }

  const periods = getPeriods();
  const avg = calculateAverageBase(periods, { retirementMonth });
  if (!avg.ok) {
    resultBox.innerHTML = `
      <div class="alert error"><strong>Chưa thể tính mức bình quân.</strong><ul>${avg.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>
      ${avg.warnings?.length ? `<div class="alert warning"><ul>${avg.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>` : ""}
    `;
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const input = {
    sex,
    birthDate,
    retirementCase,
    retirementMonth,
    averageBase: avg.averageBase,
    totalMonths: avg.totalMonths,
    compulsoryMonths: avg.compulsoryMonths,
    firstCompulsoryYm: avg.firstCompulsoryYm,
    specialMonthsTotal: Number($("specialYears").value || 0) * 12 + Number($("specialMonths").value || 0),
    impairmentPercent: Number($("impairmentPercent").value || 0),
    minimumFloorEligible: $("minimumFloorEligible").checked
  };

  const result = calculatePension(input);
  renderResult(avg, result, input);
});

addPeriodRow();
updateRetirementCase();
