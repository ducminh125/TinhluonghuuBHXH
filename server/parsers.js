import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import WordExtractor from "word-extractor";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const MAX_TEXT = 70000;
const MAX_PDF_PAGES = 8;
const TEXT_EXTENSIONS = new Set([".txt", ".csv"]);

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

async function parsePdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const textParts = [];

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    textParts.push(`--- Trang ${i} ---\n${pageText}`);
  }

  const text = cleanText(textParts.join("\n\n"));
  if (text.replace(/\s/g, "").length >= 300) {
    return { text, images: [], note: pdf.numPages > pages ? `Chỉ đọc ${pages}/${pdf.numPages} trang đầu để giới hạn dung lượng.` : null };
  }

  // PDF scan/ảnh: render tối đa 6 trang đầu thành PNG và gửi qua vision.
  const images = [];
  const renderPages = Math.min(pdf.numPages, 6);
  for (let i = 1; i <= renderPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.55 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    images.push({
      mimeType: "image/png",
      base64: canvas.toBuffer("image/png").toString("base64"),
      label: `Trang ${i}`
    });
  }

  return {
    text,
    images,
    note: `PDF có ít lớp chữ; đã chuyển ${renderPages} trang đầu thành ảnh để AI đọc bằng vision.`
  };
}

async function parseDoc(buffer, originalName) {
  const tempName = `${crypto.randomUUID()}-${path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const tempPath = path.join(os.tmpdir(), tempName);
  await fs.writeFile(tempPath, buffer);
  try {
    const extractor = new WordExtractor();
    const document = await extractor.extract(tempPath);
    return cleanText(document.getBody());
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const chunks = [];
  for (const sheetName of workbook.SheetNames.slice(0, 12)) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    chunks.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }
  return cleanText(chunks.join("\n\n"));
}

export async function parseUploadedFile(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  let text = "";
  let images = [];
  const warnings = [];

  if (ext === ".pdf") {
    const parsed = await parsePdf(file.buffer);
    text = parsed.text;
    images = parsed.images;
    if (parsed.note) warnings.push(parsed.note);
  } else if (ext === ".docx") {
    const parsed = await mammoth.extractRawText({ buffer: file.buffer });
    text = cleanText(parsed.value);
    if (parsed.messages?.length) warnings.push("Word có một số thành phần không chuyển thành văn bản; cần kiểm tra lại bảng biểu/phần tử đặc biệt.");
  } else if (ext === ".doc") {
    text = await parseDoc(file.buffer, file.originalname);
  } else if ([".xls", ".xlsx"].includes(ext)) {
    text = parseWorkbook(file.buffer);
  } else if (TEXT_EXTENSIONS.has(ext)) {
    text = cleanText(file.buffer.toString("utf8"));
  } else {
    throw new Error("Định dạng file chưa được hỗ trợ. Hãy dùng PDF, DOC, DOCX, XLS, XLSX, CSV hoặc TXT.");
  }

  if (!text && !images.length) {
    throw new Error("Không đọc được nội dung có ích từ file.");
  }

  return { text, images, warnings };
}
