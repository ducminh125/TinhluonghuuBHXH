import OpenAI from "openai";

const SYSTEM_PROMPT = `Bạn là bộ trích xuất dữ liệu quá trình đóng BHXH Việt Nam. Chỉ đọc dữ liệu, KHÔNG tự tính lương hưu, KHÔNG suy đoán số tiền thiếu.

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
      "note":"chuỗi ngắn"
    }
  ],
  "warnings":["..."]
}

Quy tắc trích xuất:
1. Mỗi khoảng liên tục có cùng mức đóng phải là một period riêng; không tạo hai period chồng tháng.
2. regime=state khi tài liệu thể hiện tiền lương theo chế độ do Nhà nước quy định hoặc thể hiện hệ số lương/ngạch/bậc.
3. regime=employer khi mức lương đóng BHXH là tiền đồng do doanh nghiệp/người sử dụng lao động quyết định.
4. regime=voluntary khi tài liệu ghi BHXH tự nguyện/thu nhập lựa chọn đóng.
5. Không chắc chế độ thì regime=unknown và thêm warning; tuyệt đối không đoán state/employer.
6. valueType=coefficient chỉ khi tài liệu thực sự thể hiện hệ số dùng làm căn cứ đóng. Khi đó coefficient là số hệ số; amountVnd=null.
7. valueType=vnd khi tài liệu thể hiện mức tiền đóng/tháng bằng VND; amountVnd là số nguyên, không chứa dấu chấm/phẩy; coefficient=null.
8. Nếu bảng có nhiều mức theo từng tháng/năm, gộp các tháng liên tiếp chỉ khi toàn bộ regime, valueType và giá trị giống nhau.
9. Không lấy tiền lương thực nhận nếu không phải căn cứ đóng BHXH.
10. Ghi các điểm không chắc chắn trong warnings để người dùng kiểm tra.`;

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

function normalizePeriod(row, warnings, index) {
  const regime = ["state", "employer", "voluntary", "unknown"].includes(row?.regime) ? row.regime : "unknown";
  let valueType = ["coefficient", "vnd"].includes(row?.valueType) ? row.valueType : "vnd";
  if (regime !== "state" && valueType === "coefficient") {
    warnings.push(`Dòng AI ${index + 1}: hệ số xuất hiện ngoài chế độ lương Nhà nước; đã giữ dữ liệu để người dùng kiểm tra.`);
  }

  const coefficient = row?.coefficient == null ? null : Number(row.coefficient);
  const amountVnd = row?.amountVnd == null ? null : Number(String(row.amountVnd).replace(/[^0-9.-]/g, ""));

  return {
    from: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.from || "")) ? row.from : "",
    to: /^\d{4}-(0[1-9]|1[0-2])$/.test(String(row?.to || "")) ? row.to : "",
    regime,
    valueType,
    coefficient: Number.isFinite(coefficient) ? coefficient : null,
    amountVnd: Number.isFinite(amountVnd) ? amountVnd : null,
    note: String(row?.note || "").slice(0, 160)
  };
}

export async function extractBhxhWithAI({ text, images = [], filename = "hồ sơ", parserWarnings = [] }) {
  const apiKey = process.env.SHOPAIKEY_API_KEY;
  const baseURL = process.env.SHOPAIKEY_BASE_URL || "https://api.shopaikey.com/v1";
  const model = process.env.SHOPAIKEY_MODEL || "gpt-5.6-terra";

  if (!apiKey) {
    throw new Error("Server chưa cấu hình SHOPAIKEY_API_KEY. Sao chép .env.example thành .env và thêm API key.");
  }

  const client = new OpenAI({ apiKey, baseURL });
  const userContent = [
    {
      type: "text",
      text: `Tên file: ${filename}\n\nNội dung đã trích xuất:\n${text || "(không có lớp chữ; đọc từ ảnh trang PDF bên dưới)"}`
    },
    ...images.map(image => ({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: "high" }
    }))
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
      throw new Error(`ShopAIKey không chấp nhận model "${model}". Hãy đặt SHOPAIKEY_MODEL theo model ID đang được tài khoản ShopAIKey hỗ trợ. Chi tiết: ${message}`);
    }
    throw new Error(`Lỗi ShopAIKey: ${message}`);
  }

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("ShopAIKey không trả về nội dung trích xuất.");

  let data;
  try {
    data = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("AI trả về dữ liệu không phải JSON hợp lệ. Hãy thử lại hoặc kiểm tra file nguồn.");
  }

  const warnings = [
    ...parserWarnings,
    ...(Array.isArray(data.warnings) ? data.warnings.map(String) : [])
  ];
  const periods = (Array.isArray(data.periods) ? data.periods : []).map((row, index) => normalizePeriod(row, warnings, index));

  if (!periods.length) warnings.push("AI chưa nhận diện được giai đoạn đóng BHXH nào; cần nhập thủ công hoặc dùng tài liệu rõ hơn.");

  return {
    person: {
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(data.person?.birthDate || "")) ? data.person.birthDate : null,
      sex: normalizeSex(data.person?.sex)
    },
    periods,
    warnings: [...new Set(warnings)],
    meta: { model, source: "ShopAIKey" }
  };
}
