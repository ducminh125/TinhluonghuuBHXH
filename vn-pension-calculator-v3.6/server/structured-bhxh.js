import * as XLSX from 'xlsx';
import { dedupeImportedPeriods } from '../js/contributions.js';

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function norm(s) {
  return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseYm(value) {
  const s = clean(value);
  let m = s.match(/^(0?[1-9]|1[0-2])\s*[\/-]\s*(\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2,'0')}`;
  m = s.match(/^(\d{4})\s*[\/-]\s*(0?[1-9]|1[0-2])$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}`;
  return '';
}

function parseNumber(value) {
  if (value == null || value === '') return 0;
  let s = clean(value).replace(/\s/g,'');
  if (!s) return 0;
  // Vietnamese decimal comma; strip thousands separators conservatively.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,'').replace(',','.');
  else if (/^-?\d+(,\d+)$/.test(s)) s = s.replace(',','.');
  else s = s.replace(/[^0-9.-]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parsePercent(value) {
  const n = parseNumber(value);
  return n > 0 ? n : 0;
}

function reviewPeriod(row, index) {
  const recognizedFields = [];
  const missingFields = [];
  if (row.from) recognizedFields.push(`Từ ${row.from.slice(5,7)}/${row.from.slice(0,4)}`); else missingFields.push('Từ tháng/năm');
  if (row.to) recognizedFields.push(`Đến ${row.to.slice(5,7)}/${row.to.slice(0,4)}`); else missingFields.push('Đến tháng/năm');
  if (row.regime && row.regime !== 'unknown') recognizedFields.push('Chế độ tiền lương/thu nhập'); else missingFields.push('Chế độ tiền lương/thu nhập');
  if (row.valueType === 'coefficient' && row.coefficient > 0) recognizedFields.push(`Hệ số ${row.coefficient}`);
  else if (row.valueType === 'vnd' && row.amountVnd > 0) recognizedFields.push(`Mức đóng ${Math.round(row.amountVnd).toLocaleString('vi-VN')} đ`);
  else missingFields.push(row.valueType === 'coefficient' ? 'Hệ số lương' : 'Mức tiền làm căn cứ đóng');
  if (row.positionAllowanceCoeff > 0) recognizedFields.push(`PC chức vụ ${row.positionAllowanceCoeff}`);
  if (row.seniorityBeyondPercent > 0) recognizedFields.push(`TNVK ${row.seniorityBeyondPercent}%`);
  if (row.professionalSeniorityPercent > 0) recognizedFields.push(`Thâm niên nghề ${row.professionalSeniorityPercent}%`);
  if (row.allowanceVnd > 0) recognizedFields.push(`Phụ cấp tính đóng ${Math.round(row.allowanceVnd).toLocaleString('vi-VN')} đ`);
  if (row.note) recognizedFields.push('Chức danh/đơn vị/ghi chú');
  return { index, ...row, recognizedFields, missingFields, validForImport: missingFields.length === 0 };
}

function findHeader(rows) {
  for (let i=0; i<Math.min(rows.length,30); i++) {
    const r = rows[i].map(norm);
    const hasFrom = r.some(x => x.includes('tu thang'));
    const hasTo = r.some(x => x.includes('den thang'));
    const hasContribution = r.some(x => x.includes('muc dong'));
    if (hasFrom && hasTo && hasContribution) return i;
  }
  return -1;
}

function declaredBhxhMonths(rows) {
  for (const row of rows) {
    const text = clean((row || []).filter(Boolean).join(' '));
    const n = norm(text);
    if (!n.includes('thoi gian dong bhxh') || !n.includes('huu tri')) continue;
    const m = n.match(/la\s+(\d+)\s+nam(?:\s+(\d+)\s+thang)?/);
    if (m) return Number(m[1]) * 12 + Number(m[2] || 0);
  }
  return null;
}

function periodMonths(period) {
  if (!period?.from || !period?.to) return 0;
  const [fy,fm]=period.from.split('-').map(Number);
  const [ty,tm]=period.to.split('-').map(Number);
  return (ty*12+tm) - (fy*12+fm) + 1;
}

function looksLikeStateDescription(text) {
  const s = norm(text);
  return /(chuyen vien|can bo|cong chuc|vien chuc|giam doc|pho giam doc|truong phong|pho truong|vu truong|bao hiem xa hoi|cuc thue|so |bo |ban |uy ban)/.test(s);
}

function parseRows(rows, headerIndex, sheetName) {
  const periods = [];
  const confirmationWarnings = [];
  const informationalWarnings = [];
  let skippedUnemployment = 0;

  // The standard 07/SBH export uses A..O in this order. Header detection protects against unrelated workbooks.
  for (let i=headerIndex+1; i<rows.length; i++) {
    const r = rows[i] || [];
    const from = parseYm(r[0]);
    const to = parseYm(r[1]);
    const desc = clean(r[2]);
    if (!from && !to) continue;
    if (!from || !to) {
      confirmationWarnings.push(`${sheetName}: dòng ${i+1} có thời gian chưa đầy đủ (${clean(r[0])} → ${clean(r[1])}).`);
      continue;
    }

    const descNorm = norm(desc);
    if (descNorm.includes('bao hiem that nghiep') || descNorm.includes('bhtn')) {
      skippedUnemployment++;
      continue;
    }

    const contribution = parseNumber(r[3]);
    const positionAllowanceCoeff = parseNumber(r[4]);
    const seniorityBeyondPercent = parsePercent(r[5]);
    const professionalSeniorityPercent = parsePercent(r[6]);
    const areaAllowance = clean(r[7]);
    const otherAllowance = clean(r[8]);
    const reelection = clean(r[9]);
    const contributionRate = clean(r[10]);
    const salaryMain = parseNumber(r[11]);
    const salaryAllowance = parseNumber(r[12]);
    const salaryOther = parseNumber(r[13]);

    let regime = 'unknown';
    let valueType = 'vnd';
    let coefficient = null;
    let amountVnd = null;
    let allowanceVnd = 0;

    // Civil-service exports normally contain a coefficient in "Mức đóng". Values > 20 are treated as money.
    if (contribution > 0 && contribution <= 20 && looksLikeStateDescription(desc)) {
      regime = 'state';
      valueType = 'coefficient';
      coefficient = contribution;
    } else if (contribution > 0 && looksLikeStateDescription(desc)) {
      regime = 'state';
      valueType = 'vnd';
      amountVnd = contribution;
      if (from < '1993-04') {
        informationalWarnings.push(`${sheetName}: giai đoạn ${from.slice(5,7)}/${from.slice(0,4)}–${to.slice(5,7)}/${to.slice(0,4)} có mức đóng tiền trước 04/1993; hệ thống giữ nguyên số ghi trên hồ sơ và chỉ yêu cầu quy đổi nếu giai đoạn này thực sự thuộc cửa sổ tính bình quân.`);
      }
    } else if (salaryMain > 0) {
      regime = 'employer';
      valueType = 'vnd';
      amountVnd = salaryMain;
      allowanceVnd = salaryAllowance + salaryOther;
    } else if (contribution > 0) {
      regime = contribution <= 20 ? 'state' : 'employer';
      valueType = contribution <= 20 ? 'coefficient' : 'vnd';
      coefficient = valueType === 'coefficient' ? contribution : null;
      amountVnd = valueType === 'vnd' ? contribution : null;
      confirmationWarnings.push(`${sheetName}: giai đoạn ${from.slice(5,7)}/${from.slice(0,4)}–${to.slice(5,7)}/${to.slice(0,4)} chưa đủ thông tin để xác định chắc chắn chế độ tiền lương; hệ thống tạm phân loại theo cấu trúc mức đóng và cần kiểm tra nếu hồ sơ thuộc khu vực doanh nghiệp.`);
    } else {
      confirmationWarnings.push(`${sheetName}: giai đoạn ${from.slice(5,7)}/${from.slice(0,4)}–${to.slice(5,7)}/${to.slice(0,4)} không có mức đóng đọc được.`);
      continue;
    }

    const noteParts = [desc];
    if (areaAllowance) noteParts.push(`PC khu vực: ${areaAllowance}`);
    if (otherAllowance) noteParts.push(`PC khác: ${otherAllowance}`);
    if (reelection) noteParts.push(`Tái cử: ${reelection}`);
    if (contributionRate) noteParts.push(`Tỷ lệ đóng: ${contributionRate}`);

    periods.push({
      from, to, regime, valueType, coefficient, amountVnd,
      positionAllowanceCoeff,
      reservedDifferenceCoeff: 0,
      seniorityBeyondPercent,
      professionalSeniorityPercent,
      allowanceVnd,
      note: noteParts.filter(Boolean).join(' · ').slice(0,240)
    });
  }

  if (skippedUnemployment) informationalWarnings.push(`Đã bỏ ${skippedUnemployment} dòng chỉ ghi đóng BHTN để không tính trùng vào quá trình BHXH hưu trí.`);
  return { periods, confirmationWarnings, informationalWarnings };
}

export function tryParseBhxhWorkbook(buffer, originalName='hồ sơ.xlsx') {
  const started = Date.now();
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type:'buffer', cellDates:false, raw:false });
  } catch {
    return null;
  }

  const allPeriods = [];
  const confirmationWarnings = [];
  const informationalWarnings = [];
  let recognizedSheets = 0;
  let declaredMonths = null;

  for (const sheetName of workbook.SheetNames.slice(0,12)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false, blankrows:false });
    const headerIndex = findHeader(rows);
    const declared = declaredBhxhMonths(rows);
    if (declared != null) declaredMonths = declared;
    if (headerIndex < 0) continue;
    recognizedSheets++;
    const parsed = parseRows(rows, headerIndex, sheetName);
    allPeriods.push(...parsed.periods);
    confirmationWarnings.push(...parsed.confirmationWarnings);
    informationalWarnings.push(...parsed.informationalWarnings);
  }

  if (!recognizedSheets || allPeriods.length < 2) return null;

  const deduped = dedupeImportedPeriods(allPeriods);
  confirmationWarnings.push(...(deduped.warnings || []));
  const parsedMonths = deduped.periods.reduce((sum,p)=>sum+periodMonths(p),0);
  if (declaredMonths != null && parsedMonths !== declaredMonths) {
    confirmationWarnings.push(`Hồ sơ ghi tổng thời gian đóng BHXH hưu trí là ${Math.floor(declaredMonths/12)} năm ${declaredMonths%12} tháng, trong khi các dòng đã đọc tương ứng ${Math.floor(parsedMonths/12)} năm ${parsedMonths%12} tháng. Cần kiểm tra giai đoạn bị thiếu/trùng trước khi tính.`);
  }
  const reviewPeriods = deduped.periods.map(reviewPeriod);
  const incompleteRows = reviewPeriods.filter(x => !x.validForImport).length;

  return {
    person: { birthDate:null, sex:null },
    reviewPeriods,
    periods: deduped.periods,
    warnings: [...new Set([...informationalWarnings, ...confirmationWarnings])],
    informationalWarnings: [...new Set(informationalWarnings)],
    confirmationWarnings: [...new Set(confirmationWarnings)],
    meta: {
      provider: 'local',
      model: null,
      source: 'structured_parser',
      parserMode: 'mau_07_sbh_excel',
      sourceCount: 1,
      recognizedRows: reviewPeriods.length,
      incompleteRows,
      importableRows: deduped.periods.length,
      duplicatesRemoved: deduped.duplicatesRemoved,
      conflicts: deduped.conflicts,
      needsConfirmation: incompleteRows > 0 || deduped.conflicts > 0 || confirmationWarnings.length > 0,
      latencyMs: Date.now() - started,
      declaredBhxhMonths: declaredMonths,
      parsedBhxhMonths: parsedMonths,
      originalName
    }
  };
}
