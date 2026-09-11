import { LAW_META, formatAgeMonths, normalRetirementAgeMonthsForYear } from "./rules.js";
import { calculatePension, pensionStartMonthFromStatutoryMonth } from "./pension.js";

const $ = (id) => document.getElementById(id);
const form = $("calculatorForm");
const resultBox = $("resultBox");
const specialBlock = $("specialBlock");
const impairmentBlock = $("impairmentBlock");
const caseSelect = $("retirementCase");
const insuranceType = $("insuranceType");

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

$("lawVersion").textContent = `${LAW_META.law} · hiệu lực từ 01/07/2025 · dữ liệu pháp lý cập nhật ${LAW_META.updatedAt}`;

function displayMonth(yyyyMm) {
  if (!yyyyMm) return "—";
  const [y, m] = yyyyMm.split("-");
  return `${m}/${y}`;
}

function updateConditionalFields() {
  const c = caseSelect.value;
  const isVoluntary = insuranceType.value === "voluntary";

  caseSelect.disabled = isVoluntary;
  if (isVoluntary) caseSelect.value = "normal";

  specialBlock.hidden = !["heavy", "coal", "specialImpairment"].includes(caseSelect.value);
  impairmentBlock.hidden = !["impairment61", "impairment81", "specialImpairment"].includes(caseSelect.value);
}

insuranceType.addEventListener("change", updateConditionalFields);
caseSelect.addEventListener("change", updateConditionalFields);
updateConditionalFields();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fd = new FormData(form);
  const input = {
    insuranceType: fd.get("insuranceType"),
    sex: fd.get("sex"),
    birthDate: fd.get("birthDate"),
    retirementMonth: fd.get("retirementMonth"),
    contributionYears: Number(fd.get("contributionYears")),
    contributionMonths: Number(fd.get("contributionMonths")),
    averageBase: Number(String(fd.get("averageBase")).replace(/\D/g, "")),
    retirementCase: fd.get("retirementCase"),
    specialYears: Number(fd.get("specialYears") || 0),
    specialMonths: Number(fd.get("specialMonths") || 0),
    impairmentPercent: Number(fd.get("impairmentPercent") || 0),
    minimumFloorEligible: fd.get("minimumFloorEligible") === "on"
  };

  if (!input.birthDate || !input.retirementMonth || !input.averageBase) {
    resultBox.innerHTML = `<div class="alert error">Vui lòng nhập đủ ngày sinh, tháng dự kiến nghỉ hưu và mức bình quân tiền lương/thu nhập làm căn cứ tính lương hưu.</div>`;
    return;
  }

  const result = calculatePension(input);
  const retirementYear = Number(input.retirementMonth.slice(0, 4));
  const normalAge = formatAgeMonths(normalRetirementAgeMonthsForYear(input.sex, retirementYear));
  const officialStart = pensionStartMonthFromStatutoryMonth(result.statutoryMonth);

  const eligibilityHtml = result.eligible
    ? `<div class="alert success"><strong>Đủ điều kiện theo dữ liệu đã nhập.</strong> Kết quả dưới đây là mức ước tính theo công thức pháp luật.</div>`
    : `<div class="alert error"><strong>Chưa đủ điều kiện theo dữ liệu đã nhập.</strong><ul>${result.errors.map(e => `<li>${e}</li>`).join("")}</ul></div>`;

  resultBox.innerHTML = `
    ${eligibilityHtml}
    <div class="result-grid">
      <article class="metric primary">
        <span>${result.eligible ? "Lương hưu ước tính/tháng" : "Mức theo công thức nếu đủ điều kiện"}</span>
        <strong>${money.format(result.monthlyPension)}</strong>
        ${result.floorApplicable && result.monthlyPension > result.rawMonthly ? `<small>Đã áp dụng mức tối thiểu bằng mức tham chiếu ${money.format(result.referenceLevel)}</small>` : ""}
      </article>
      <article class="metric"><span>Tỷ lệ trước giảm trừ</span><strong>${number.format(result.baseRate)}%</strong></article>
      <article class="metric"><span>Giảm do nghỉ trước tuổi</span><strong>${number.format(result.reduction)}%</strong></article>
      <article class="metric"><span>Tỷ lệ cuối cùng</span><strong>${number.format(result.finalRate)}%</strong></article>
      <article class="metric"><span>Thời gian đóng dùng tính tỷ lệ</span><strong>${number.format(result.roundedContributionYears)} năm</strong></article>
      <article class="metric"><span>Mức bình quân đầu vào</span><strong>${money.format(input.averageBase)}</strong></article>
    </div>
    <div class="explain">
      <h3>Kiểm tra tuổi và thời điểm</h3>
      <p>Tuổi nghỉ hưu thông thường áp dụng trong năm ${retirementYear}: <strong>${normalAge}</strong>.</p>
      <p>Tháng đạt tuổi nghỉ hưu thông thường theo tháng/năm sinh: <strong>${displayMonth(result.statutoryMonth)}</strong>; tháng hưởng lương hưu theo lộ trình nếu nghỉ đúng tuổi: <strong>${displayMonth(officialStart)}</strong>.</p>
      <p>Tháng bạn dự kiến nghỉ: <strong>${displayMonth(input.retirementMonth)}</strong>; tháng dự kiến bắt đầu hưởng sau tháng nghỉ: <strong>${displayMonth(result.pensionStartMonth)}</strong>.</p>
      ${result.caseEarliestMonth && input.retirementCase !== "normal" ? `<p>Mốc tháng sớm nhất của trường hợp đã chọn theo lộ trình tuổi: <strong>${displayMonth(result.caseEarliestMonth)}</strong>.</p>` : ""}
      ${result.earlyMonths ? `<p>Số tháng nghỉ sớm dùng tính giảm tỷ lệ: <strong>${result.earlyMonths} tháng</strong>.</p>` : ""}
      ${result.notes.length ? `<ul>${result.notes.map(n => `<li>${n}</li>`).join("")}</ul>` : ""}
    </div>
  `;
  resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
});

const avgInput = $("averageBase");
avgInput.addEventListener("input", () => {
  const digits = avgInput.value.replace(/\D/g, "");
  avgInput.value = digits ? Number(digits).toLocaleString("vi-VN") : "";
});
