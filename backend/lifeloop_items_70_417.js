
    if (!isNonEmptyString(name)) return sendError(res, 400, "INVALID_NAME", "Please tell us what the item is.");
    if (category && !isOneOf(category, CATEGORY_OPTIONS)) return sendError(res, 400, "INVALID_CATEGORY", "Unrecognized category.");
    if (condition && !isOneOf(condition, CONDITION_OPTIONS)) return sendError(res, 400, "INVALID_CONDITION", "Unrecognized condition.");

    const parsedAge = toFiniteNumber(ageYears);
    let images = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadPromises = req.files.map(file => uploadBufferToCloudinary(file.buffer, "items"));
        const urls = await Promise.all(uploadPromises);
        images = urls.map(url => ({ url }));
      } catch (e) {
        console.error("Cloudinary upload failed:", e);
        return sendError(res, 400, "IMAGE_UPLOAD_FAILED", "Could not upload the photo(s).");
      }
    }

    // OCR is feature-flagged off for this deployment to avoid caching penalties
    // on serverless environments.
    if (req.body?.runOcr === "true") {
      return sendError(res, 400, "OCR_DISABLED", "OCR functionality is not available in this deployment.");
    }
    let ocrText = null;

    let analysis;
    try {
      analysis = await analyzeItem({
        name,
        category,
        condition,
        ageYears: parsedAge,
        images,
        hasPhotos: images.length > 0,
        ocrText,
      });
    } catch (err) {
      console.error("Item analysis failed:", err.message);
      return sendError(res, 500, "ANALYSIS_FAILED", "We couldn't analyze this item. Please try again.");
    }

    // User-supplied brand/model/material (if given) take precedence over
    // anything guessed, since the user has ground truth.
    if (isNonEmptyString(brand)) analysis.identification.brand = brand.trim();
    if (isNonEmptyString(model)) analysis.identification.model = model.trim();
    if (isNonEmptyString(material)) analysis.identification.material = material.trim();

    const items = await readCollection("items");
    const item = {
      id: uuidv4(),
      userId: req.userId,
      name: name.trim(),
      category: category || "other",
      condition: condition || "good",
      ageYears: Number.isFinite(parsedAge) ? parsedAge : null,
      images: images.map((img) => ({ url: img.url })),
      identification: analysis.identification,
      recommendations: analysis.recommendations,
      primaryAction: analysis.recommendations[0].action,
      lifePotential: analysis.lifePotential,
      note: analysis.note,
      source: analysis.source,
      overallConfidence: analysis.overallConfidence,
      ocrText: ocrText || null,
      userAction: null,
      userActionAt: null,
      saved: false,
      notes: "",
      assistantCache: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    items.push(item);
    await writeCollection("items", items);
    await badges.checkAndAwardBadges(req.userId);

    res.status(201).json({ item: decorateItem(item) });
  }
);

// ---- QR / barcode scanning -------------------------------------------------
// Decodes a QR code from a photo. 1D barcodes (UPC/EAN) aren't supported —
// see services/barcode.js for why. If BARCODE_LOOKUP_API_URL is configured,
// also attempts a product lookup; otherwise just returns the decoded text.

router.post(
  "/scan-code",
  requireAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: "Too many code scans in a short time. Please wait a bit." }),
  upload.single("codeImage"),
  async (req, res) => {
    if (!req.file) return sendError(res, 400, "MISSING_IMAGE", "Please provide a photo containing a QR code.");

    const code = await barcode.decodeQRFromImageBuffer(req.file.buffer);

    if (!code) return sendError(res, 404, "NO_CODE_FOUND", "No QR code was detected in that photo.");

    const product = await barcode.lookupProductByCode(code);
    res.json({ code, product });
  }
);

// ---- List / search / filter / paginate ------------------------------------

router.get ("/", requireAuth, async (req, res) => {
  const { search, category, condition, action, saved, completed, dateFrom, dateTo, sort } = req.query;
  const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize);

  let items = (await readCollection("items")).filter((i) => i.userId === req.userId);

  if (isNonEmptyString(search)) {
    const needle = search.trim().toLowerCase();
    items = items.filter((i) => i.name.toLowerCase().includes(needle));
  }
  if (category) items = items.filter((i) => i.category === category);
  if (condition) items = items.filter((i) => i.condition === condition);
  if (action) items = items.filter((i) => i.primaryAction === action || i.userAction === action);
  if (saved === "true") items = items.filter((i) => i.saved);
  if (saved === "false") items = items.filter((i) => !i.saved);
  if (completed === "true") items = items.filter((i) => Boolean(i.userAction));
  if (completed === "false") items = items.filter((i) => !i.userAction);
  if (isNonEmptyString(dateFrom)) items = items.filter((i) => new Date(i.createdAt) >= new Date(dateFrom));
  if (isNonEmptyString(dateTo)) items = items.filter((i) => new Date(i.createdAt) <= new Date(dateTo));

  const sorters = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    score_desc: (a, b) => b.lifePotential - a.lifePotential,
    score_asc: (a, b) => a.lifePotential - b.lifePotential,
  };
  items.sort(sorters[sort] || sorters.newest);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  res.json({ items: pageItems.map(decorateItem), page, pageSize, total, totalPages });
});

router.get ("/stats", requireAuth, async (req, res) => {
  const items = (await readCollection("items")).filter((i) => i.userId === req.userId);
  const actioned = items.filter((i) => i.userAction);

  const countsByAction = Object.fromEntries(VALID_ACTIONS.map((a) => [a, 0]));
  for (const item of actioned) countsByAction[item.userAction] = (countsByAction[item.userAction] || 0) + 1;

  let estimatedValueSaved = 0;
  let materialKeptKg = 0;
  let itemsMissingImpactData = 0;
  for (const item of actioned) {
    if (item.userAction === "recycle") continue;
    const impact = CATEGORY_IMPACT[item.category];
    if (!impact) {
      itemsMissingImpactData += 1;
      continue;
    }
    estimatedValueSaved += impact.valueINR;
    materialKeptKg += impact.weightKg;
  }

  res.json({
    stats: {
      totalItems: items.length,
      itemsInLoop: items.length - actioned.length,
      itemsCompleted: actioned.length,
      countsByAction,
      estimatedValueSaved: Math.round(estimatedValueSaved),
      materialKeptKg: Math.round(materialKeptKg * 10) / 10,
      itemsMissingImpactData,
      impactMethodologyNote: IMPACT_METHODOLOGY_NOTE,
    },
  });
});

router.get ("/:id", requireAuth, async (req, res) => {
  const item = (await readCollection("items")).find((i) => i.id === req.params.id && i.userId === req.userId);
  if (!item) return sendError(res, 404, "ITEM_NOT_FOUND", "That item couldn't be found.");
  res.json({ item: decorateItem(item) });
});

// ---- Update (corrections, actual action taken, notes, saved) -------------

router.patch("/:id", requireAuth, async (req, res) => {
  const items = await readCollection("items");
  const item = items.find((i) => i.id === req.params.id && i.userId === req.userId);
  if (!item) return sendError(res, 404, "ITEM_NOT_FOUND", "That item couldn't be found.");

  const { name, category, condition, ageYears, brand, model, material, userAction, notes, saved, recompute } = req.body || {};

  if (userAction !== undefined) {
    if (userAction !== null && !isOneOf(userAction, VALID_ACTIONS)) {
      return sendError(res, 400, "INVALID_ACTION", "Unrecognized action.");
    }
    item.userAction = userAction;
    item.userActionAt = userAction ? new Date().toISOString() : null;
  }
  if (typeof saved === "boolean") item.saved = saved;
  if (typeof notes === "string") item.notes = notes.slice(0, 2000);

  let correctionMade = false;
  if (isNonEmptyString(name) && name.trim() !== item.name) { item.name = name.trim(); correctionMade = true; }
  if (category && isOneOf(category, CATEGORY_OPTIONS) && category !== item.category) { item.category = category; correctionMade = true; }
  if (condition && isOneOf(condition, CONDITION_OPTIONS) && condition !== item.condition) { item.condition = condition; correctionMade = true; }
  const parsedAge = toFiniteNumber(ageYears);
  if (ageYears !== undefined && parsedAge !== item.ageYears) { item.ageYears = Number.isFinite(parsedAge) ? parsedAge : null; correctionMade = true; }
  if (isNonEmptyString(brand)) { item.identification.brand = brand.trim(); correctionMade = true; }
  if (isNonEmptyString(model)) { item.identification.model = model.trim(); correctionMade = true; }
  if (isNonEmptyString(material)) { item.identification.material = material.trim(); correctionMade = true; }

  if (correctionMade) {
    item.identification.uncertain = false;
    item.identification.uncertaintyReason = null;
    item.identification.correctedByUser = true;
  }

  if (correctionMade && recompute) {
    try {
      const analysis = await analyzeItem({
        name: item.name,
        category: item.category,
        condition: item.condition,
        ageYears: item.ageYears,
        images: [],
        hasPhotos: item.images.length > 0,
      });
      item.recommendations = analysis.recommendations;
      item.primaryAction = analysis.recommendations[0].action;
      item.lifePotential = analysis.lifePotential;
      item.note = analysis.note;
      item.source = analysis.source;
      item.assistantCache = {}; // stale after recompute
    } catch (err) {
      console.warn("Recompute after correction failed, keeping previous recommendations:", err.message);
    }
  }

  item.updatedAt = new Date().toISOString();
  await writeCollection("items", items);
  if (userAction) await badges.checkAndAwardBadges(req.userId);
  res.json({ item: decorateItem(item) });
});

router.delete ("/:id", requireAuth, async (req, res) => {
  const items = await readCollection("items");
  const item = items.find((i) => i.id === req.params.id && i.userId === req.userId);
  if (!item) return sendError(res, 404, "ITEM_NOT_FOUND", "That item couldn't be found.");

  // Images are on Cloudinary, we don't delete them locally anymore
  await writeCollection("items", items.filter((i) => i.id !== req.params.id));
  res.json({ success: true });
});

// ---- AI assistants: repair / reuse / resell / donate / recycle -----------

router.get("/:id/assistant/:type", requireAuth, async (req, res) => {
  const { type } = req.params;
  if (!isOneOf(type, ASSISTANT_TYPES)) return sendError(res, 400, "INVALID_ASSISTANT_TYPE", "Unrecognized guide type.");

  const items = await readCollection("items");
  const item = items.find((i) => i.id === req.params.id && i.userId === req.userId);
  if (!item) return sendError(res, 404, "ITEM_NOT_FOUND", "That item couldn't be found.");

  const forceRegenerate = req.query.regenerate === "true";
  if (!forceRegenerate && item.assistantCache?.[type]) {
    return res.json({ guide: item.assistantCache[type], cached: true });
  }

  let images = [];
  try {
    if (item.images && item.images.length > 0) {
      const fetchPromises = item.images.map(async (img) => {
        try {
          const response = await fetch(img.url);
          const arrayBuffer = await response.arrayBuffer();
          return {
            base64: Buffer.from(arrayBuffer).toString("base64"),
            mediaType: response.headers.get("content-type") || "image/jpeg",
          };
        } catch {
          return null;
        }
      });
      images = (await Promise.all(fetchPromises)).filter(Boolean);
    }
  } catch {
    images = [];
  }

  const generators = {
    repair: () => assistants.getRepairGuide(item, images),
    reuse: () => assistants.getReuseIdeas(item, images),
    resell: () => assistants.getResaleListing(item, images),
    donate: () => assistants.getDonationGuidance(item),
    recycle: () => assistants.getRecyclingGuidance(item),
  };

  try {
    const guide = await generators[type]();

    const freshItems = await readCollection("items");
    const freshItem = freshItems.find((i) => i.id === item.id);
    if (freshItem) {
      freshItem.assistantCache = freshItem.assistantCache || {};
      freshItem.assistantCache[type] = guide;
      freshItem.updatedAt = new Date().toISOString();
      await writeCollection("items", freshItems);
    }
    res.json({ guide });
  } catch (err) {
    sendError(res, 500, "GUIDE_FAILED", "Could not generate the guide right now.");
  }
});

// ---- LifeLoop assistant (fixed fast-check questions, no free text) -------
// The whole point of this feature is that it is NOT a general chatbot: the
// API only accepts one of a small, fixed set of question types (see
// services/chatbot.js). There is no endpoint anywhere that accepts
// arbitrary user-typed text for this feature — that's what keeps it
// structurally on-topic, not just prompted to be.

router.get(
  "/:id/chat/:questionType",
  requireAuth,
  rateLimit({ windowMs: 5 * 60 * 1000, max: 60, message: "Too many questions in a short time. Please wait a bit." }),
  async (req, res) => {
    const { questionType } = req.params;
    if (!isOneOf(questionType, chatbot.QUESTION_TYPES)) {
      return sendError(res, 400, "INVALID_QUESTION", "Unrecognized question.");
    }

    const item = (await readCollection("items")).find((i) => i.id === req.params.id && i.userId === req.userId);
    if (!item) return sendError(res, 404, "ITEM_NOT_FOUND", "That item couldn't be found.");

    try {
      const result = await chatbot.answerQuestion(decorateItem(item), questionType);
      res.json(result);
    } catch (err) {
      console.error("LifeLoop assistant failed:", err.message);
      sendError(res, 500, "CHAT_FAILED", "Could not get an answer right now. Please try again.");
    }
  }
);

// Multer errors (file too large, too many files, bad type) land here.
router.use ((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return sendError(res, 400, "UPLOAD_ERROR", err.message || "Could not process the uploaded file(s).");
  }
  next();
});

module.exports = router;
