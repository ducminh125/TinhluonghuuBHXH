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
const MAX_TOTAL_UPLOAD = 60 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 20 }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use("/js", express.static(path.join(rootDir, "js"), { dotfiles: "ignore" }));
app.get("/styles.css", (_req, res) => res.sendFile(path.join(rootDir, "styles.css")));
app.get(["/", "/index.html"], (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(rootDir, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.SHOPAIKEY_API_KEY),
    model: process.env.SHOPAIKEY_MODEL || "gpt-5.6-terra"
  });
});

app.post(
  "/api/import",
  upload.fields([{ name: "files", maxCount: 20 }, { name: "file", maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = [...(req.files?.files || []), ...(req.files?.file || [])];
      if (!files.length) return res.status(400).json({ error: "Chưa nhận được tệp tải lên." });

      const totalSize = files.reduce((sum, file) => sum + Number(file.size || file.buffer?.length || 0), 0);
      if (totalSize > MAX_TOTAL_UPLOAD) {
        return res.status(400).json({ error: "Tổng dung lượng các tệp vượt 60 MB. Hãy chia thành nhiều lần import." });
      }

      const parsedFiles = await Promise.all(files.map(async file => ({
        file,
        parsed: await parseUploadedFile(file)
      })));

      const text = parsedFiles
        .filter(item => item.parsed.text)
        .map(item => `===== ${item.file.originalname} =====\n${item.parsed.text}`)
        .join("\n\n");

      const images = parsedFiles.flatMap(item =>
        item.parsed.images.map(image => ({
          ...image,
          label: `${item.file.originalname}${image.label && image.label !== item.file.originalname ? ` · ${image.label}` : ""}`
        }))
      );

      const parserWarnings = parsedFiles.flatMap(item =>
        item.parsed.warnings.map(w => `${item.file.originalname}: ${w}`)
      );

      const extracted = await extractBhxhWithAI({
        text,
        images,
        filename: files.map(file => file.originalname).join(", "),
        parserWarnings,
        sourceCount: files.length
      });
      res.json(extracted);
    } catch (error) {
      console.error("[api/import]", error);
      res.status(400).json({ error: error?.message || "Không thể xử lý tệp." });
    }
  }
);

app.use((_req, res) => res.sendFile(path.join(rootDir, "index.html")));

if (process.env.VERCEL !== "1") {
  app.listen(port, () => {
    console.log(`VN Pension Calculator: http://localhost:${port}`);
  });
}

export default app;
