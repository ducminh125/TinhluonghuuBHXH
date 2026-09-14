import { LAW_META, formatAgeMonths, normalRetirementAgeMonthsForYear } from "./rules.js";
import {
  calculatePension,
  earliestRetirementMonthForCase,
  pensionStartMonthFromStatutoryMonth,
  statutoryRetirementAttainmentMonth
} from "./pension.js";
import {
  buildProjectedPeriods,
  calculateAverageBase,
  compactDuration,
  dedupeImportedPeriods,
  inferStateSalaryProgression
} from "./contributions.js";

const $ = id => document.getElementById(id);
const form = $("calculatorForm");
const resultBox = $("resultBox");
const rowsHost = $("periodRows");
const rowTemplate = $("periodRowTemplate");
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
let pendingImport = null;
let lastForecastHistorySignature = "";
let forecastInferenceCache = null;

$("lawVersion").textContent = `${LAW_META.law} · ${LAW_META.decree} · ${LAW_META.retirementDecree} · cập nhật ${LAW_META.updatedAt}`;

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

function displayDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function parseVietnameseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const compact = raw.replace(/\D/g, "");
  const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  const parts = match ? [match[1], match[2], match[3]] : (compact.length === 8 ? [compact.slice(0, 2), compact.slice(2, 4), compact.slice(4)] : null);
  if (!parts) return "";
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseVietnameseMonth(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  const compact = raw.replace(/\D/g, "");
  const match = raw.match(/^(\d{1,2})[\/.-](\d{4})$/);
  const parts = match ? [match[1], match[2]] : (compact.length === 6 ? [compact.slice(0, 2), compact.slice(2)] : null);
  if (!parts) return "";
  const month = Number(parts[0]);
  const year = Number(parts[1]);
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function normalizeDateField(el) {
  if (!el?.value) return;
  const iso = parseVietnameseDate(el.value);
  if (iso) el.value = displayDate(iso);
}

function normalizeMonthField(el) {
  if (!el?.value) return;
  const ym = parseVietnameseMonth(el.value);
  if (ym) el.value = displayMonth(ym);
}

function valueLabel(regime, valueType) {
  if (regime === "state" && valueType === "coefficient") {
    return { placeholder: "VD: 4.98", unit: "hệ số lương", step: "0.01" };
  }
  if (regime === "employer") {
    return { placeholder: "VD: 12000000", unit: "lương công việc/chức danh (VND/tháng)", step: "1000" };
  }
  if (regime === "voluntary") {
    return { placeholder: "VD: 8000000", unit: "thu nhập làm căn cứ đóng (VND/tháng)", step: "1000" };
  }
  return { placeholder: "VD: 12000000", unit: "tổng tiền lương đóng BHXH (VND/tháng)", step: "1000" };
}

function syncPeriodRow(tr) {
  const regime = tr.querySelector('[data-field="regime"]');
  const valueType = tr.querySelector('[data-field="valueType"]');
  const value = tr.querySelector('[data-field="value"]');
  const unit = tr.querySelector(".value-unit");
  const stateAllowances = tr.querySelector(".state-allowances");
  const vndAllowances = tr.querySelector(".vnd-allowances");
  const vndAllowanceLabel = tr.querySelector(".vnd-allowance-label");
  const allowanceNone = tr.querySelector(".allowance-none");
  const allowanceDetails = tr.querySelector(".allowance-details");

  if (regime.value !== "state") valueType.value = "vnd";
  for (const option of valueType.options) {
    option.disabled = regime.value !== "state" && option.value === "coefficient";
  }

  const meta = valueLabel(regime.value, valueType.value);
  value.placeholder = meta.placeholder;
  value.step = meta.step;
  unit.textContent = meta.unit;

  const showState = regime.value === "state" && valueType.value === "coefficient";
  const showVndAllowance = valueType.value === "vnd" && ["state", "employer"].includes(regime.value);
  stateAllowances.hidden = !showState;
  vndAllowances.hidden = !showVndAllowance;
  if (showVndAllowance) {
    vndAllowanceLabel.textContent = regime.value === "state"
      ? "Phụ cấp tính đóng tách riêng (VND/tháng)"
      : "PC + khoản bổ sung tính đóng (VND/tháng)";
  }
  allowanceNone.hidden = showState || showVndAllowance;
  allowanceDetails.classList.toggle("is-empty", !showState && !showVndAllowance);

  updateForecastPreview();
}

function setRowValue(tr, field, value) {
  const el = tr.querySelector(`[data-field="${field}"]`);
  if (el && value != null && value !== "") el.value = value;
}

function setRowMonthValue(tr, field, value) {
  const el = tr.querySelector(`[data-field="${field}"]`);
  if (!el || value == null || value === "") return;
  const ym = parseVietnameseMonth(value);
  el.value = ym ? displayMonth(ym) : value;
}

function addPeriodRow(data = {}) {
  const fragment = rowTemplate.content.cloneNode(true);
  const tr = fragment.querySelector("tr");

  setRowMonthValue(tr, "from", data.from);
  setRowMonthValue(tr, "to", data.to);
  setRowValue(tr, "regime", data.regime || "state");
  setRowValue(tr, "valueType", data.valueType || (data.regime === "state" ? "coefficient" : "vnd"));
  setRowValue(tr, "value", data.valueType === "coefficient" ? data.coefficient : data.amountVnd);
  setRowValue(tr, "positionAllowanceCoeff", data.positionAllowanceCoeff ?? 0);
  setRowValue(tr, "reservedDifferenceCoeff", data.reservedDifferenceCoeff ?? 0);
  setRowValue(tr, "seniorityBeyondPercent", data.seniorityBeyondPercent ?? 0);
  setRowValue(tr, "professionalSeniorityPercent", data.professionalSeniorityPercent ?? 0);
  setRowValue(tr, "allowanceVnd", data.allowanceVnd ?? 0);
  setRowValue(tr, "note", data.note);

  tr.querySelector('[data-field="regime"]').addEventListener("change", () => syncPeriodRow(tr));
  tr.querySelector('[data-field="valueType"]').addEventListener("change", () => syncPeriodRow(tr));
  tr.querySelectorAll("input,select").forEach(el => {
    if (!["regime", "valueType"].includes(el.dataset.field)) el.addEventListener("change", updateForecastPreview);
  });
  ["from", "to"].forEach(field => {
    const el = tr.querySelector(`[data-field="${field}"]`);
    el?.addEventListener("blur", () => {
      normalizeMonthField(el);
      updateForecastPreview();
    });
  });
  tr.querySelector(".remove-row").addEventListener("click", () => {
    tr.remove();
    if (!rowsHost.children.length) addPeriodRow();
    updateForecastPreview();
  });

  syncPeriodRow(tr);
  rowsHost.appendChild(fragment);
  updateForecastPreview();
}

function getPeriods({ includeBlank = true } = {}) {
  const rows = [...rowsHost.querySelectorAll(".period-row")].map(tr => {
    const get = field => tr.querySelector(`[data-field="${field}"]`)?.value ?? "";
    const regime = get("regime");
    const valueType = get("valueType");
    const numericValue = Number(get("value") || 0);
    return {
      from: parseVietnameseMonth(get("from")),
      to: parseVietnameseMonth(get("to")),
      regime,
      valueType,
      coefficient: valueType === "coefficient" ? numericValue : null,
      amountVnd: valueType === "vnd" ? numericValue : null,
      positionAllowanceCoeff: Number(get("positionAllowanceCoeff") || 0),
      reservedDifferenceCoeff: Number(get("reservedDifferenceCoeff") || 0),
      seniorityBeyondPercent: Number(get("seniorityBeyondPercent") || 0),
      professionalSeniorityPercent: Number(get("professionalSeniorityPercent") || 0),
      allowanceVnd: Number(get("allowanceVnd") || 0),
      note: get("note")
    };
  });

  if (includeBlank) return rows;
  return rows.filter(row => row.from || row.to || row.coefficient || row.amountVnd);
}

function getRetirementMonth() {
  const retirementCase = $("retirementCase").value;
  const value = retirementCase === "normal" ? $("statutoryRetirementMonth").value : $("actualRetirementMonth").value;
  return parseVietnameseMonth(value);
}

function updateRetirementDates({ resetSpecial = false } = {}) {
  const sex = $("sex").value;
  const birthDate = parseVietnameseDate($("birthDate").value);
  const statutory = sex && birthDate ? statutoryRetirementAttainmentMonth(birthDate, sex) : null;
  $("statutoryRetirementMonth").value = statutory ? displayMonth(statutory) : "";
  $("statutoryPensionStart").value = statutory ? displayMonth(pensionStartMonthFromStatutoryMonth(statutory)) : "";

  const retirementCase = $("retirementCase").value;
  if (retirementCase !== "normal" && sex && birthDate) {
    const earliest = earliestRetirementMonthForCase(birthDate, sex, retirementCase);
    const actual = $("actualRetirementMonth");
    if (resetSpecial || !actual.value) actual.value = displayMonth(earliest || statutory || "");
    $("earliestMonthHint").textContent = earliest
      ? `Mốc tuổi sớm nhất theo nhóm đã chọn: ${displayMonth(earliest)}. Điều kiện thời gian đóng vẫn phải được kiểm tra.`
      : "Trường hợp này không thể xác định chỉ từ ngày sinh; cần nhập tháng nghỉ thực tế theo hồ sơ.";
  }
  updateForecastPreview();
}

function updateRetirementCase() {
  const c = $("retirementCase").value;
  $("actualRetirementBlock").hidden = c === "normal";
  $("specialBlock").hidden = !["heavy", "coal", "specialImpairment"].includes(c);
  $("impairmentBlock").hidden = !["impairment61", "impairment81", "specialImpairment"].includes(c);
  updateRetirementDates({ resetSpecial: true });
}

function forecastOptions() {
  return {
    gradeStartMonth: parseVietnameseMonth($("gradeStartMonth").value),
    raiseCadenceMonths: Number($("raiseCadenceMonths").value || 0),
    coefficientStep: Number($("coefficientStep").value || 0),
    maxCoefficient: Number($("maxCoefficient").value || 0)
  };
}

function latestPeriod(periods) {
  return [...periods]
    .filter(p => /^\d{4}-\d{2}$/.test(p.to || ""))
    .sort((a, b) => String(b.to).localeCompare(String(a.to)))[0] || null;
}

function forecastHistorySignature(periods) {
  return JSON.stringify(periods.map(p => ({
    from: p.from, to: p.to, regime: p.regime, valueType: p.valueType, coefficient: p.coefficient
  })));
}

function applyForecastInference(basePeriods, coefficientMode, { force = false } = {}) {
  const panel = $("forecastInference");
  if (!coefficientMode) {
    panel.hidden = true;
    panel.innerHTML = "";
    forecastInferenceCache = null;
    lastForecastHistorySignature = forecastHistorySignature(basePeriods);
    return null;
  }

  const signature = forecastHistorySignature(basePeriods);
  if (!force && signature === lastForecastHistorySignature && forecastInferenceCache) return forecastInferenceCache;

  const inference = inferStateSalaryProgression(basePeriods);
  forecastInferenceCache = inference;
  lastForecastHistorySignature = signature;

  // Chỉ tự điền lại khi lịch sử hệ số thay đổi. Sau đó người dùng vẫn có thể chỉnh tay.
  if (inference?.applicable) {
    $("gradeStartMonth").value = inference.gradeStartMonth ? displayMonth(inference.gradeStartMonth) : "";
    $("raiseCadenceMonths").value = [24, 36, 60].includes(inference.raiseCadenceMonths) ? String(inference.raiseCadenceMonths) : "0";
    $("coefficientStep").value = inference.coefficientStep > 0 ? number.format(inference.coefficientStep).replace(",", ".") : "";
    $("maxCoefficient").value = inference.maxCoefficient > 0 ? number.format(inference.maxCoefficient).replace(",", ".") : "";

    const identified = inference.scaleName
      ? `Nhận diện <strong>${escapeHtml(inference.scaleName)}</strong>${inference.gradeNumber ? `, bậc ${inference.gradeNumber}` : ""}; hệ số hiện tại <strong>${number.format(inference.currentCoefficient)}</strong>.`
      : `Hệ số hiện tại <strong>${number.format(inference.currentCoefficient)}</strong>; chưa đủ căn cứ xác định duy nhất thang lương.`;
    const autoFields = [
      inference.gradeStartMonth ? `bắt đầu bậc hiện tại ${displayMonth(inference.gradeStartMonth)}` : null,
      inference.raiseCadenceMonths ? `chu kỳ ${inference.raiseCadenceMonths} tháng` : null,
      inference.coefficientStep > 0 ? `tăng ${number.format(inference.coefficientStep)} hệ số/bậc` : null,
      inference.maxCoefficient > 0 ? `hệ số tối đa ${number.format(inference.maxCoefficient)}` : null
    ].filter(Boolean).join(" · ");
    const changes = (inference.observedChanges || []).slice(-4)
      .map(x => `${number.format(x.coefficient)} từ ${displayMonth(x.from)}`)
      .join(" → ");
    const warningHtml = inference.warnings?.length
      ? `<ul>${inference.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
      : "";
    panel.innerHTML = `<strong>Tự nhận diện từ lịch sử hệ số:</strong> ${identified}${changes ? `<br>Lịch sử gần nhất: ${escapeHtml(changes)}.` : ""}${autoFields ? `<br>${escapeHtml(autoFields)}` : ""}${warningHtml}`;
    panel.hidden = false;
  } else {
    $("gradeStartMonth").value = "";
    $("raiseCadenceMonths").value = "0";
    $("coefficientStep").value = "";
    $("maxCoefficient").value = "";
    panel.innerHTML = `<strong>Chưa tự nhận diện được:</strong> ${escapeHtml(inference?.warnings?.[0] || "Chưa có lịch sử hệ số phù hợp.")}`;
    panel.hidden = false;
  }
  return inference;
}

function updateForecastPreview() {
  const enabled = $("autoExtend").checked;
  $("forecastConfig").hidden = !enabled;
  if (!enabled) return;

  const basePeriods = getPeriods({ includeBlank: false });
  const retirementMonth = getRetirementMonth();
  const latest = latestPeriod(basePeriods);
  const coefficientMode = latest?.regime === "state" && latest?.valueType === "coefficient";
  $("coefficientForecastFields").hidden = !coefficientMode;
  applyForecastInference(basePeriods, coefficientMode);

  if (!latest) {
    $("forecastPreview").innerHTML = "Hãy nhập ít nhất một giai đoạn đóng để xác định mức đóng hiện tại.";
    return;
  }
  if (!retirementMonth) {
    $("forecastPreview").innerHTML = "Chưa xác định được tháng nghỉ hưu để tạo phần thời gian dự kiến.";
    return;
  }

  const projection = buildProjectedPeriods(basePeriods, retirementMonth, forecastOptions());
  if (!projection.monthsAdded) {
    $("forecastPreview").innerHTML = `Dữ liệu đã kéo dài đến <strong>${displayMonth(latest.to)}</strong>; không có tháng nào cần bổ sung.`;
    return;
  }

  const modeText = coefficientMode
    ? `theo hệ số hiện tại${projection.periods.length > 1 ? " và lịch nâng bậc tự nhận diện/đã hiệu chỉnh" : ""}`
    : "theo mức tiền đóng hiện tại";
  const warnings = projection.warnings.length
    ? `<br><span>${projection.warnings.map(escapeHtml).join(" ")}</span>`
    : "";
  $("forecastPreview").innerHTML = `Sẽ tự bổ sung <strong>${projection.monthsAdded} tháng</strong>, từ sau ${displayMonth(latest.to)} đến ${displayMonth(retirementMonth)}, ${modeText}.${warnings}`;
}

$("sex").addEventListener("change", () => updateRetirementDates({ resetSpecial: true }));
$("birthDate").addEventListener("change", () => updateRetirementDates({ resetSpecial: true }));
$("birthDate").addEventListener("blur", () => { normalizeDateField($("birthDate")); updateRetirementDates({ resetSpecial: true }); });
$("retirementCase").addEventListener("change", updateRetirementCase);
$("actualRetirementMonth").addEventListener("change", updateForecastPreview);
$("actualRetirementMonth").addEventListener("blur", () => { normalizeMonthField($("actualRetirementMonth")); updateForecastPreview(); });
$("gradeStartMonth").addEventListener("blur", () => { normalizeMonthField($("gradeStartMonth")); updateForecastPreview(); });
$("addPeriodBtn").addEventListener("click", () => addPeriodRow());
$("autoExtend").addEventListener("change", updateForecastPreview);
["gradeStartMonth", "raiseCadenceMonths", "coefficientStep", "maxCoefficient"].forEach(id => $(id).addEventListener("change", updateForecastPreview));

function setImportStatus(type, html) {
  $("importStatus").innerHTML = `<div class="alert ${type}">${html}</div>`;
}

function regimeLabel(regime) {
  if (regime === "state") return "Lương Nhà nước";
  if (regime === "employer") return "Lương do NSDLĐ quyết định";
  if (regime === "voluntary") return "BHXH tự nguyện";
  return "Chưa nhận diện";
}

function fallbackReviewPeriod(row, index) {
  const recognizedFields = [];
  const missingFields = [];
  if (row.from) recognizedFields.push(`Từ ${displayMonth(row.from)}`); else missingFields.push("Từ tháng/năm");
  if (row.to) recognizedFields.push(`Đến ${displayMonth(row.to)}`); else missingFields.push("Đến tháng/năm");
  if (row.regime && row.regime !== "unknown") recognizedFields.push("Chế độ tiền lương/thu nhập"); else missingFields.push("Chế độ tiền lương/thu nhập");
  if (row.valueType === "coefficient" && Number(row.coefficient) > 0) recognizedFields.push(`Hệ số ${number.format(row.coefficient)}`);
  else if (row.valueType === "vnd" && Number(row.amountVnd) > 0) recognizedFields.push(`Mức đóng ${money.format(row.amountVnd)}`);
  else missingFields.push(row.valueType === "coefficient" ? "Hệ số lương" : "Mức tiền làm căn cứ đóng");
  return { index, ...row, recognizedFields, missingFields, validForImport: missingFields.length === 0 };
}

function clearImportReview() {
  pendingImport = null;
  $("importReview").hidden = true;
  $("importReviewRows").innerHTML = "";
  $("importPersonReview").innerHTML = "";
  $("importReviewWarnings").innerHTML = "";
}

function renderImportReview(payload) {
  pendingImport = payload;
  const reviewRows = Array.isArray(payload.reviewPeriods) && payload.reviewPeriods.length
    ? payload.reviewPeriods
    : (payload.periods || []).map(fallbackReviewPeriod);

  const person = [];
  if (payload.person?.birthDate) person.push(`Ngày sinh: <strong>${displayDate(payload.person.birthDate)}</strong>`);
  if (payload.person?.sex) person.push(`Giới tính: <strong>${payload.person.sex === "male" ? "Nam" : "Nữ"}</strong>`);
  $("importPersonReview").innerHTML = person.length ? person.join(" · ") : "Không nhận diện thông tin cá nhân";

  $("importReviewRows").innerHTML = reviewRows.map((row, index) => {
    const recognized = (row.recognizedFields || []).length
      ? `<div class="review-fields">${row.recognizedFields.map(x => `<span class="review-pill ok">${escapeHtml(x)}</span>`).join("")}</div>`
      : `<span class="review-pill">Chưa có</span>`;
    const missing = (row.missingFields || []).length
      ? `<div class="review-fields">${row.missingFields.map(x => `<span class="review-pill missing">${escapeHtml(x)}</span>`).join("")}</div>`
      : `<span class="review-pill ok">Đủ dữ liệu bắt buộc</span>`;
    const period = row.from || row.to ? `${displayMonth(row.from)} → ${displayMonth(row.to)}` : "—";
    return `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(period)}</td>
      <td>${escapeHtml(regimeLabel(row.regime))}</td>
      <td>${recognized}</td>
      <td>${missing}</td>
      <td><span class="review-status ${row.validForImport ? "ok" : "missing"}">${row.validForImport ? "Sẵn sàng" : "Cần bổ sung"}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">Chưa nhận diện được giai đoạn đóng BHXH nào.</td></tr>`;

  const warningList = [...new Set(payload.warnings || [])];
  $("importReviewWarnings").innerHTML = warningList.length
    ? `<div class="alert warning"><strong>Cần đối chiếu:</strong><ul>${warningList.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
    : "";

  $("applyImportBtn").disabled = !(payload.periods || []).length;
  $("importReview").hidden = false;
}

function renderSelectedFiles(files) {
  if (!files.length) {
    $("selectedFiles").innerHTML = "";
    return;
  }
  const names = files.slice(0, 6).map(file => `<span>${escapeHtml(file.name)}</span>`).join("");
  const more = files.length > 6 ? `<span>+ ${files.length - 6} tệp khác</span>` : "";
  $("selectedFiles").innerHTML = `${names}${more}`;
}

$("historyFiles").addEventListener("change", event => {
  const files = [...(event.target.files || [])];
  clearImportReview();
  renderSelectedFiles(files);
  if (files.length) {
    setImportStatus("warning", `Đã chọn <strong>${files.length} tệp</strong>. Hệ thống sẽ đọc chung, lọc phần trùng và hiển thị bảng kiểm tra trước khi nhập.`);
  } else {
    $("importStatus").innerHTML = "";
  }
});

$("importAiBtn").addEventListener("click", async () => {
  const files = [...($("historyFiles").files || [])];
  if (!files.length) {
    setImportStatus("error", "Hãy chọn ít nhất một ảnh hoặc tệp hồ sơ trước.");
    return;
  }

  const btn = $("importAiBtn");
  btn.disabled = true;
  btn.textContent = "Đang đọc hồ sơ…";
  clearImportReview();
  setImportStatus("warning", `Đang đọc ${files.length} tệp, chuẩn hóa các giai đoạn và đối chiếu phần ảnh bị gối/trùng.`);

  try {
    const body = new FormData();
    files.forEach(file => body.append("files", file));
    const response = await fetch("/api/import", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    renderImportReview(payload);
    const recognized = Number(payload.meta?.recognizedRows ?? payload.reviewPeriods?.length ?? payload.periods?.length ?? 0);
    const ready = Number(payload.meta?.importableRows ?? payload.periods?.length ?? 0);
    const missing = Number(payload.meta?.incompleteRows ?? Math.max(0, recognized - ready));
    const removed = Number(payload.meta?.duplicatesRemoved || 0);
    setImportStatus(
      "success",
      `<strong>Đã đọc ${payload.meta?.sourceCount || files.length} tệp.</strong> Nhận diện ${recognized} dòng; ${ready} dòng đủ dữ liệu để nhập${missing ? `, ${missing} dòng còn thiếu` : ""}${removed ? `; đã loại ${removed} phần trùng hệt nhau` : ""}. Hãy kiểm tra bảng bên dưới rồi xác nhận.`
    );
  } catch (error) {
    const extra = location.protocol === "file:" || ["github.io"].some(x => location.hostname.endsWith(x))
      ? " Chức năng đọc hồ sơ cần chạy bằng backend Node/Vercel để giữ bí mật API key."
      : "";
    setImportStatus("error", `<strong>Không đọc được hồ sơ:</strong> ${escapeHtml(error.message)}.${extra}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Đọc dữ liệu từ file";
  }
});

$("applyImportBtn").addEventListener("click", () => {
  if (!pendingImport) return;

  if (pendingImport.person?.sex && !$("sex").value) $("sex").value = pendingImport.person.sex;
  if (pendingImport.person?.birthDate && !$("birthDate").value) $("birthDate").value = displayDate(pendingImport.person.birthDate);
  updateRetirementDates({ resetSpecial: true });

  const existing = getPeriods({ includeBlank: false });
  const combined = dedupeImportedPeriods([...existing, ...(pendingImport.periods || [])]);
  if (combined.periods.length) {
    rowsHost.innerHTML = "";
    combined.periods.forEach(addPeriodRow);
  }

  const allWarnings = [...new Set([...(pendingImport.warnings || []), ...(combined.warnings || [])])];
  const removed = Number(pendingImport.meta?.duplicatesRemoved || 0) + Number(combined.duplicatesRemoved || 0);
  const warningHtml = allWarnings.length
    ? `<ul>${allWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
    : "";
  const importedCount = (pendingImport.periods || []).length;
  setImportStatus(
    "success",
    `<strong>Đã xác nhận ${importedCount} giai đoạn hợp lệ từ file.</strong> Bảng quá trình đóng hiện có ${combined.periods.length} giai đoạn sau khi gộp${removed ? `; đã loại ${removed} phần tháng trùng lặp` : ""}. Hãy đối chiếu lần cuối trước khi tính.${warningHtml}`
  );
  clearImportReview();
  lastForecastHistorySignature = "";
  updateForecastPreview();
});

$("cancelImportBtn").addEventListener("click", () => {
  clearImportReview();
  setImportStatus("warning", "Đã bỏ kết quả đọc file; dữ liệu quá trình đóng hiện tại không thay đổi.");
});

function renderResult(avg, result, input) {
  const status = result.eligible ? "success" : "error";
  const statusBody = result.eligible
    ? `<strong>Đủ điều kiện theo dữ liệu đã nhập.</strong> Mức dưới đây được tính từ lịch sử đóng và phần dự kiến đã lựa chọn.`
    : `<strong>Chưa đủ điều kiện theo dữ liệu đã nhập.</strong><ul>${result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>`;

  const retirementYear = Number(input.retirementMonth.slice(0, 4));
  const normalAge = formatAgeMonths(normalRetirementAgeMonthsForYear(input.sex, retirementYear));
  const stateWindowText = avg.stateWindow
    ? (avg.stateWindow.prescribedMonths
      ? `${avg.stateWindow.usedMonths} tháng gần nhất trong dữ liệu lương Nhà nước (mốc pháp lý: ${avg.stateWindow.prescribedMonths} tháng)`
      : `toàn bộ ${avg.stateWindow.usedMonths} tháng lương Nhà nước`)
    : "không áp dụng";

  const nonProvisionalWarnings = (avg.warnings || []).filter(w =>
    !/năm bắt đầu hưởng|hệ số\/mức tham chiếu|tương lai|tự bổ sung|giả định|bộ hệ số/i.test(w)
  );
  const warningHtml = nonProvisionalWarnings.length
    ? `<div class="explain"><h3>Lưu ý dữ liệu</h3><ul>${nonProvisionalWarnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>`
    : "";

  const provisionalHtml = avg.provisional
    ? `<div class="provisional-summary"><strong>Kết quả đang tạm tính.</strong> ${avg.projectedMonths ? `Có ${avg.projectedMonths} tháng đóng tương lai được tự bổ sung; ` : ""}các mốc tương lai chưa có hệ số/mức lương cơ sở mới sẽ dùng dữ liệu pháp lý mới nhất đã tích hợp và cần cập nhật khi có quy định hoặc mức lương thực tế mới.</div>`
    : "";

  resultBox.innerHTML = `
    <div class="alert ${status}">${statusBody}</div>
    <div class="result-grid">
      <article class="metric primary">
        <span>${result.eligible ? "Lương hưu ước tính/tháng" : "Mức theo công thức nếu đủ điều kiện"}</span>
        <strong>${money.format(result.monthlyPension)}</strong>
        <small>Theo dữ liệu đóng và giả định người dùng đã nhập</small>
      </article>
      <article class="metric"><span>Mức bình quân tự tính</span><strong>${money.format(avg.averageBase)}</strong></article>
      <article class="metric"><span>Tỷ lệ hưởng cuối cùng</span><strong>${number.format(result.finalRate)}%</strong></article>
      <article class="metric"><span>Tổng thời gian đóng</span><strong>${compactDuration(avg.totalMonths)}</strong></article>
      <article class="metric"><span>Thời gian tự bổ sung</span><strong>${compactDuration(avg.projectedMonths || 0)}</strong></article>
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
      ${avg.stateAverage != null ? `<p>Bình quân riêng phần lương Nhà nước: <strong>${money.format(avg.stateAverage)}</strong>. Các phụ cấp thuộc căn cứ đóng đã được cộng vào tiền lương từng tháng trước khi bình quân.</p>` : ""}
      <p>Công thức tỷ lệ: <strong>${number.format(result.baseRate)}%</strong>${result.reduction ? ` − ${number.format(result.reduction)}% giảm trừ` : ""} = <strong>${number.format(result.finalRate)}%</strong>.</p>
      <p>Lương hưu trước kiểm tra mức tối thiểu: <strong>${money.format(result.rawMonthly)}</strong>${result.floorApplicable ? `; mức tham chiếu dùng kiểm tra: <strong>${money.format(result.referenceLevel)}</strong>` : ""}.</p>
    </div>
    ${warningHtml}
    ${provisionalHtml}
  `;
  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const sex = $("sex").value;
  const birthDate = parseVietnameseDate($("birthDate").value);
  const retirementCase = $("retirementCase").value;
  const statutoryMonth = parseVietnameseMonth($("statutoryRetirementMonth").value);
  const retirementMonth = getRetirementMonth();

  if (!sex || !birthDate || !statutoryMonth) {
    resultBox.innerHTML = `<div class="alert error">Vui lòng nhập giới tính và ngày sinh hợp lệ theo dạng <strong>dd/mm/yyyy</strong> để hệ thống xác định tháng nghỉ hưu.</div>`;
    return;
  }
  if (!retirementMonth) {
    resultBox.innerHTML = `<div class="alert error">Trường hợp nghỉ hưu đặc thù cần có tháng nghỉ hưu thực tế theo dạng <strong>mm/yyyy</strong>.</div>`;
    return;
  }

  const basePeriods = getPeriods({ includeBlank: false });
  if (!basePeriods.length) {
    resultBox.innerHTML = `<div class="alert error">Vui lòng nhập ít nhất một giai đoạn đóng BHXH hợp lệ hoặc import hồ sơ trước khi tính.</div>`;
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  let periods = basePeriods;
  let forecastWarnings = [];
  if ($("autoExtend").checked) {
    const projection = buildProjectedPeriods(basePeriods, retirementMonth, forecastOptions());
    periods = [...basePeriods, ...projection.periods];
    forecastWarnings = projection.warnings;
  }

  const avg = calculateAverageBase(periods, { retirementMonth });
  avg.warnings = [...new Set([...(forecastWarnings || []), ...(avg.warnings || [])])];
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
