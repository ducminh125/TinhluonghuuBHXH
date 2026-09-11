import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUploadedFile } from "./parsers.js";
import { extractBhxhWithAI } from "./shopaikey.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Chỉ public các asset frontend; không expose thư mục server, tests hoặc file cấu hình.
app.use("/js", express.static(path.join(rootDir, "js"), { dotfiles: "ignore" }));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(rootDir, "styles.css")));
app.get(["/", "/index.html"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    shopaikeyConfigured: Boolean(process.env.SHOPAIKEY_API_KEY),
    model: process.env.SHOPAIKEY_MODEL || "gpt-5.6-terra"
  });
});

app.post("/api/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Chưa nhận được file tải lên." });
    const parsed = await parseUploadedFile(req.file);
    const extracted = await extractBhxhWithAI({
      ...parsed,
      filename: req.file.originalname,
      parserWarnings: parsed.warnings
    });
    res.json(extracted);
  } catch (error) {
    console.error("[api/import]", error);
    res.status(400).json({ error: error?.message || "Không thể xử lý file." });
  }
});

app.use((_req, res) => res.sendFile(path.join(rootDir, "index.html")));

if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`VN Pension Calculator: http://localhost:${port}`);
  });
}

export default app;
