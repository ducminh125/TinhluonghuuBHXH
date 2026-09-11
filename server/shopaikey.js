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
  const deduped = dedupeImportedPeriods(rawPeriods);
  warnings.push(...deduped.warnings);

  if (!deduped.periods.length) warnings.push("AI chưa nhận diện được giai đoạn đóng BHXH nào; cần nhập thủ công hoặc dùng tài liệu rõ hơn.");

  return {
    person: {
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.person?.birthDate || "")) ? data.person.birthDate : null,
      sex: normalizeSex(data.person?.sex)
    },
    periods: deduped.periods,
    warnings: [...new Set(warnings)],
    meta: {
      model,
      source: "AI",
      sourceCount,
      duplicatesRemoved: deduped.duplicatesRemoved,
      conflicts: deduped.conflicts
    }
  };
}
