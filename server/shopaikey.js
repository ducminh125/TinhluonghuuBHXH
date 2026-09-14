import OpenAI from "openai";
import { dedupeImportedPeriods } from "../js/contributions.js";

const SYSTEM_PROMPT = `Bạn là bộ trích xuất dữ liệu quá trình đóng BHXH Việt Nam. Chỉ đọc dữ liệu, KHÔNG tự tính lương hưu, KHÔNG suy đoán số tiền thiếu.

Có thể có NHIỀU ẢNH CHỤP LIÊN TIẾP của cùng một bảng và các ảnh có vùng gối nhau. Không tạo hai lần cùng một giai đoạn chỉ vì nó xuất hiện ở nhiều ảnh.

Trả về DUY NHẤT một JSON object theo cấu trúc:
{
  "person": {"birthDate":"YYYY-MM-DD|null", "sex":"male|female|null"},
  "periods": [
    {
      "from":"YYYY-MM",
      "to":"YYYY-MM",
      "regime":"state|employer|voluntary|unknown",
      "valueType":"coefficient|vnd",
      "coefficient": number|null,
      "amountVnd": number|null,
      "positionAllowanceCoeff": number|null,
      "reservedDifferenceCoeff": number|null,
      "seniorityBeyondPercent": number|null,
      "professionalSeniorityPercent": number|null,
      "allowanceVnd": number|null,
      "note":"chuỗi ngắn"
    }
  ],
  "warnings":["..."]
}

Các trường cần ưu tiên nhận diện từ hồ sơ:
- person.birthDate và person.sex nếu tài liệu có thông tin cá nhân;
- from/to của từng giai đoạn (tháng/năm);
- regime để xác định nhóm tiền lương/thu nhập;
- valueType và một trong hai trường coefficient hoặc amountVnd;
- các phụ cấp thuộc căn cứ đóng nếu tài liệu tách riêng;
- ngạch, bậc, chức danh, đơn vị công tác hoặc nguồn dữ liệu thì ghi ngắn gọn vào note.
Nếu một giai đoạn thiếu from, to hoặc thiếu mức lương/hệ số làm căn cứ đóng thì KHÔNG tự suy đoán. Vẫn ghi warning mô tả chính xác phần còn thiếu để người dùng bổ sung.

Quy tắc trích xuất:
1. Mỗi khoảng liên tục có cùng mức đóng phải là một period riêng.
2. Khi nhiều ảnh/tệp lặp lại cùng tháng, chỉ trả một lần nếu số liệu giống nhau. Nếu cùng tháng có số liệu khác nhau, giữ dữ liệu rõ nhất và thêm warning nêu tháng cần đối chiếu.
3. regime=state khi tài liệu thể hiện tiền lương theo chế độ do Nhà nước quy định hoặc có hệ số lương/ngạch/bậc.
4. regime=employer khi mức lương đóng BHXH là tiền đồng do doanh nghiệp/người sử dụng lao động quyết định.
5. regime=voluntary khi tài liệu ghi BHXH tự nguyện/thu nhập lựa chọn đóng.
6. Không chắc chế độ thì regime=unknown và thêm warning; tuyệt đối không đoán state/employer.
7. Với lương Nhà nước theo hệ số: coefficient là HỆ SỐ LƯƠNG CHÍNH. Tách riêng nếu tài liệu có: phụ cấp chức vụ -> positionAllowanceCoeff; hệ số chênh lệch bảo lưu -> reservedDifferenceCoeff; % thâm niên vượt khung -> seniorityBeyondPercent; % thâm niên nghề -> professionalSeniorityPercent.
8. Với lương Nhà nước bằng VND: nếu tài liệu ghi TỔNG tiền lương làm căn cứ đóng BHXH thì amountVnd=tổng tiền và allowanceVnd=0 để tránh cộng hai lần. Nếu tài liệu tách tiền lương chính và phụ cấp thuộc căn cứ đóng thì amountVnd=tiền lương chính, allowanceVnd=tổng phụ cấp tính đóng tách riêng.
9. Với lương doanh nghiệp: nếu tài liệu tách lương công việc/chức danh và phụ cấp/khoản bổ sung ổn định thuộc căn cứ đóng, amountVnd là lương chính và allowanceVnd là tổng các khoản tính đóng. Nếu tài liệu đã ghi tổng mức đóng thì amountVnd là tổng và allowanceVnd=0.
10. Không lấy tiền lương thực nhận nếu không phải căn cứ đóng BHXH.
11. Gộp các tháng liên tiếp chỉ khi toàn bộ chế độ, kiểu nhập, lương và phụ cấp giống nhau.
12. Ghi các điểm không chắc chắn trong warnings để người dùng kiểm tra.`;

function stripJsonFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeSex(value) {
  const v = String(value || "").toLowerCase().trim();
  if (["male", "nam", "m"].includes(v)) return "male";
  if (["female", "nữ", "nu", "f"].includes(v)) return "female";
  return null;
}

function numeric(value) {
  if (value == null || value === "") return 0;
  const n = Number(String(value).replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}


function buildPeriodReview(row, index) {
  const recognized = [];
  const missing = [];

  if (row.from) recognized.push(`Từ ${row.from.slice(5, 7)}/${row.from.slice(0, 4)}`);
  else missing.push("Từ tháng/năm");
  if (row.to) recognized.push(`Đến ${row.to.slice(5, 7)}/${row.to.slice(0, 4)}`);
  else missing.push("Đến tháng/năm");
  if (row.from && row.to && row.from > row.to) missing.push("Khoảng thời gian hợp lệ (từ tháng phải ≤ đến tháng)");

  if (row.regime && row.regime !== "unknown") recognized.push("Chế độ tiền lương/thu nhập");
  else missing.push("Chế độ tiền lương/thu nhập");

  if (row.valueType === "coefficient" && row.coefficient > 0) recognized.push(`Hệ số ${row.coefficient}`);
  else if (row.valueType === "vnd" && row.amountVnd > 0) recognized.push(`Mức đóng ${Math.round(row.amountVnd).toLocaleString("vi-VN")} đ`);
  else missing.push(row.valueType === "coefficient" ? "Hệ số lương" : "Mức tiền làm căn cứ đóng");

  if (row.positionAllowanceCoeff > 0) recognized.push(`PC chức vụ ${row.positionAllowanceCoeff}`);
  if (row.reservedDifferenceCoeff > 0) recognized.push(`CL bảo lưu ${row.reservedDifferenceCoeff}`);
  if (row.seniorityBeyondPercent > 0) recognized.push(`TNVK ${row.seniorityBeyondPercent}%`);
  if (row.professionalSeniorityPercent > 0) recognized.push(`Thâm niên nghề ${row.professionalSeniorityPercent}%`);
  if (row.allowanceVnd > 0) recognized.push(`Phụ cấp tính đóng ${Math.round(row.allowanceVnd).toLocaleString("vi-VN")} đ`);
  if (row.note) recognized.push("Ghi chú/ngạch/bậc/chức danh");

  return {
    index,
    ...row,
    recognizedFields: recognized,
    missingFields: missing,
    validForImport: missing.length === 0
  };
}
function normalizePeriod(row, warnings, index) {
  const regime = ["state", "employer", "voluntary", "unknown"].includes(row?.regime) ? row.regime : "unknown";
  const valueType = ["coefficient", "vnd"].includes(row?.valueType) ? row.valueType : "vnd";
  if (regime !== "state" && valueType === "coefficient") {
    warnings.push(`Dòng AI ${index + 1}: hệ số xuất hiện ngoài chế độ lương Nhà nước; cần kiểm tra.`);
  }

  return {
    from: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.from || "")) ? row.from : "",
    to: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.to || "")) ? row.to : "",
    regime,
    valueType,
    coefficient: valueType === "coefficient" ? numeric(row?.coefficient) : null,
    amountVnd: valueType === "vnd" ? numeric(row?.amountVnd) : null,
    positionAllowanceCoeff: numeric(row?.positionAllowanceCoeff),
    reservedDifferenceCoeff: numeric(row?.reservedDifferenceCoeff),
    seniorityBeyondPercent: numeric(row?.seniorityBeyondPercent),
    professionalSeniorityPercent: numeric(row?.professionalSeniorityPercent),
    allowanceVnd: numeric(row?.allowanceVnd),
    note: String(row?.note || "").slice(0, 240)
  };
}

export async function extractBhxhWithAI({ text, images = [], filename = "hồ sơ", parserWarnings = [], sourceCount = 1 }) {
  const apiKey = process.env.SHOPAIKEY_API_KEY;
  const baseURL = process.env.SHOPAIKEY_BASE_URL || "https://api.shopaikey.com/v1";
  const model = process.env.SHOPAIKEY_MODEL || "gpt-5.6-terra";

  if (!apiKey) {
    throw new Error("Server chưa cấu hình API key. Sao chép .env.example thành .env và thêm khóa API.");
  }

  const client = new OpenAI({ apiKey, baseURL });
  const imageContent = images.flatMap(image => ([
    { type: "text", text: `Nguồn ảnh: ${image.label || "ảnh hồ sơ"}` },
    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" } }
  ]));
  const userContent = [
    {
      type: "text",
      text: `Nguồn: ${filename}\nSố tệp: ${sourceCount}\n\nNội dung văn bản đã trích xuất:\n${text || "(không có lớp chữ; đọc từ các ảnh bên dưới)"}`
    },
    ...imageContent
  ];

  let response;
  try {
    response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    });
  } catch (error) {
    const message = error?.message || String(error);
    if (/model|not found|does not exist|unsupported/i.test(message)) {
      throw new Error(`Nhà cung cấp API không chấp nhận model "${model}". Hãy đặt SHOPAIKEY_MODEL theo model ID tài khoản đang hỗ trợ. Chi tiết: ${message}`);
    }
    throw new Error(`Lỗi dịch vụ AI: ${message}`);
  }

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Dịch vụ AI không trả về nội dung trích xuất.");

  let data;
  try {
    data = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("AI trả về dữ liệu không phải JSON hợp lệ. Hãy thử lại hoặc kiểm tra tệp nguồn.");
  }

  const warnings = [
    ...parserWarnings,
    ...(Array.isArray(data.warnings) ? data.warnings.map(String) : [])
  ];
  const rawPeriods = (Array.isArray(data.periods) ? data.periods : []).map((row, index) => normalizePeriod(row, warnings, index));
  const reviewPeriods = rawPeriods.map((row, index) => buildPeriodReview(row, index));
  const importable = reviewPeriods.filter(row => row.validForImport).map(({ recognizedFields, missingFields, validForImport, index, ...row }) => row);
  const deduped = dedupeImportedPeriods(importable);
  warnings.push(...deduped.warnings);

  const incompleteCount = reviewPeriods.filter(row => !row.validForImport).length;
  if (incompleteCount) warnings.push(`Có ${incompleteCount} dòng chưa đủ dữ liệu bắt buộc; các dòng này sẽ không được đưa vào quá trình đóng cho đến khi người dùng bổ sung.`);
  if (!reviewPeriods.length) warnings.push("Chưa nhận diện được giai đoạn đóng BHXH nào; cần nhập thủ công hoặc dùng tài liệu rõ hơn.");

  return {
    person: {
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.person?.birthDate || "")) ? data.person.birthDate : null,
      sex: normalizeSex(data.person?.sex)
    },
    reviewPeriods,
    periods: deduped.periods,
    warnings: [...new Set(warnings)],
    meta: {
      model,
      source: "AI",
      sourceCount,
      recognizedRows: reviewPeriods.length,
      incompleteRows: incompleteCount,
      importableRows: deduped.periods.length,
      duplicatesRemoved: deduped.duplicatesRemoved,
      conflicts: deduped.conflicts
    }
  };
}
