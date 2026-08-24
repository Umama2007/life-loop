const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { sendError } = require("../utils/errors");
const { isOneOf, isNonEmptyString, toFiniteNumber, clampPagination } = require("../utils/validate");
const { imageFileFilter, verifyUploadedImages } = require("../utils/imageUpload");
const { uploadBufferToCloudinary } = require("../utils/cloudinary");
const { analyzeItem, ACTION_LABELS, VALID_ACTIONS, CATEGORY_OPTIONS, CONDITION_OPTIONS } = require("../services/recommendation");
const assistants = require("../services/assistants");
const badges = require("../services/badges");
const ocr = require("../services/ocr");
const barcode = require("../services/barcode");
const chatbot = require("../services/chatbot");

const router = express.Router();

const MAX_IMAGES_PER_SCAN = 6;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_IMAGES_PER_SCAN },
  fileFilter: imageFileFilter,
});

const ASSISTANT_TYPES = ["repair", "reuse", "resell", "donate", "recycle"];

const CATEGORY_IMPACT = {
  clothing: { weightKg: 0.4, valueINR: 500 },
  electronics: { weightKg: 1.8, valueINR: 3000 },
  tech: { weightKg: 0.6, valueINR: 8000 },
  furniture: { weightKg: 12, valueINR: 4000 },
  home: { weightKg: 2, valueINR: 1200 },
};
const IMPACT_METHODOLOGY_NOTE =
  "Estimates are illustrative averages per category (not per specific item) and only counted for items you've marked with an actual action other than recycle. Categories without a stated average show as unavailable rather than a guessed number.";

function decorateItem(item) {
  return { ...item, primaryActionLabel: ACTION_LABELS[item.primaryAction] || item.primaryAction };
}

// ---- Scanning / parsing (Creation) ----------------------------------------
router.post(
  "/scan",
  requireAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "Too many scans in a short time. Please wait a bit." }),
  upload.array("photos", MAX_IMAGES_PER_SCAN),
  verifyUploadedImages,
  async (req, res) => {
    const { name, category, condition, ageYears, brand, model, material } = req.body || {};
