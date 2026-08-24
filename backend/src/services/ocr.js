// Extracts text from a scanned item's photo (useful for reading labels,
// brand names, model numbers) using Tesseract.js — pure JS/WASM, no native
// compilation, so it installs the same way on every OS.
//
// Tesseract's default language-data CDN isn't reachable from this app's
// network policy, so we point it at a GitHub-hosted mirror instead (allowed
// by default) and cache the downloaded data locally under backend/data/
// ocr-cache/ — the first OCR call on a fresh install takes longer (one-time
// ~15MB download), every call after that is fast and fully offline.
//
// OCR is best-effort: if the network is unavailable, the download fails, or
// recognition times out, scanning must still work — we just skip OCR and
// move on, exactly like the AI recommendation engine's fallback behavior.

const path = require("path");
const Tesseract = require("tesseract.js");

const CACHE_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, "..", "..", "data"), "ocr-cache");
const LANG_DATA_SOURCE =
  process.env.OCR_LANG_DATA_URL || "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best";
const OCR_TIMEOUT_MS = 25000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("OCR timed out")), ms)),
  ]);
}

// Returns extracted text (may be empty string if no text found), or null if
// OCR could not run at all (no network for first-time data download, etc).
async function extractTextFromImageBuffer(buffer) {
  try {
    const { data } = await withTimeout(
      Tesseract.recognize(buffer, "eng", {
        langPath: LANG_DATA_SOURCE,
        cachePath: CACHE_DIR,
        gzip: true,
        logger: () => {}, // suppress verbose per-page progress logs
      }),
      OCR_TIMEOUT_MS
    );
    return (data.text || "").trim();
  } catch (err) {
    console.warn("OCR skipped (this is non-fatal — scanning continues without it):", err.message);
    return null;
  }
}

module.exports = { extractTextFromImageBuffer };
