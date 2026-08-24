// Analyzes a scanned item and produces two things:
//
// 1. An "identification" — best guess at name/category/brand/model/material/
//    condition/damage, only when photos were provided and an AI provider is
//    configured. LifeLoop never invents details it can't actually support;
//    when uncertain, it says so.
//
// 2. A ranked set of recommendations across all six actions (keep, repair,
//    reuse, resell, donate, recycle) — not just one hardcoded answer — each
//    with a confidence level and a plain-language explanation.
//
// By default everything runs on a transparent, built-in scoring model with
// zero setup and zero cost. If an AI provider is configured (see
// services/ai/index.js — Gemini today), LifeLoop instead asks it to analyze
// the item (and any photos) for a smarter, structured analysis, and
// silently falls back to the built-in model if that call fails for any
// reason — scanning should never break just because an external AI service
// is unavailable.



const VALID_ACTIONS = ["keep", "repair", "reuse", "resell", "donate", "recycle"];
const CATEGORY_OPTIONS = ["clothing", "electronics", "tech", "furniture", "home", "other"];
const CONDITION_OPTIONS = ["excellent", "good", "fair", "worn", "poor", "broken"];

const ACTION_LABELS = {
  keep: "Keep using",
  repair: "Repair",
  reuse: "Reuse",
  resell: "Resell",
  donate: "Donate",
  recycle: "Recycle",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function confidenceLabel(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ---- Built-in heuristic model -------------------------------------------

const CONDITION_BASE_SCORE = {
  excellent: 92,
  good: 78,
  fair: 55,
  worn: 40,
  poor: 25,
  broken: 12,
};

const RESELL_FRIENDLY_CATEGORIES = new Set(["electronics", "tech", "furniture"]);
const REUSE_FRIENDLY_CATEGORIES = new Set(["home", "furniture", "other"]);
const DONATE_FRIENDLY_CATEGORIES = new Set(["clothing", "home", "furniture"]);

function heuristicAnalysis({ name, category, condition, ageYears, hasPhotos, ocrText }) {
  const normalizedCategory = (category || "other").toLowerCase();
  const normalizedCondition = (condition || "good").toLowerCase();
  const baseScore = CONDITION_BASE_SCORE[normalizedCondition] ?? 60;
  const age = Number.isFinite(ageYears) ? ageYears : 0;
  const ageDeduction = clamp(age * 2.5, 0, 35);
  const lifePotential = Math.round(clamp(baseScore - ageDeduction, 4, 98));
  const label = name || "this item";

  // Score every action from 0-100 based on the same inputs, rather than
  // picking one winner and ignoring the rest.
  const scores = {
    keep: clamp(lifePotential - 5, 0, 100),
    repair: clamp(100 - Math.abs(lifePotential - 55) * 1.8, 0, 100),
    reuse: clamp(
      45 + (REUSE_FRIENDLY_CATEGORIES.has(normalizedCategory) ? 20 : 0) - Math.abs(lifePotential - 45) * 0.4,
      0,
      100
    ),
    resell: clamp(
      lifePotential - 10 + (RESELL_FRIENDLY_CATEGORIES.has(normalizedCategory) ? 20 : -10),
      0,
      100
    ),
    donate: clamp(
      70 - Math.abs(lifePotential - 50) * 0.6 + (DONATE_FRIENDLY_CATEGORIES.has(normalizedCategory) ? 10 : 0),
      0,
      100
    ),
    recycle: clamp(100 - lifePotential, 0, 100),
  };

  const explanations = {
    keep: `${label} is in ${normalizedCondition} condition${age ? ` at ${age} year(s) old` : ""}, so it likely still does its job well.`,
    repair: `A fix could meaningfully extend ${label}'s life given its current ${normalizedCondition} condition.`,
    reuse: `${label} could be repurposed for a different use, especially common for ${normalizedCategory} items.`,
    resell: RESELL_FRIENDLY_CATEGORIES.has(normalizedCategory)
      ? `${normalizedCategory} items like this often retain resale value even in ${normalizedCondition} condition.`
      : `${label} may have some resale value, though ${normalizedCategory} items typically sell for less.`,
    donate: `${label} is usable but may not be worth reselling — donating gives it a second life for someone else.`,
    recycle: lifePotential < 30
      ? `${label} has limited remaining life — recycling its materials is likely the most responsible option.`
      : `Recycling remains an option if ${label} isn't repaired, reused, resold, or donated.`,
  };

  const recommendations = VALID_ACTIONS.map((action) => ({
    action,
    score: Math.round(scores[action]),
    confidence: confidenceLabel(scores[action]),
    explanation: explanations[action],
  })).sort((a, b) => b.score - a.score);

  // Confidence in the overall analysis itself depends on how much
  // information we actually have — not just the scores above.
  const infoPoints = [category, condition, Number.isFinite(ageYears), hasPhotos].filter(Boolean).length;
  const overallConfidence = infoPoints >= 3 ? "medium" : "low"; // heuristic model is never "high" confidence

  return {
    source: "builtin",
    lifePotential,
    recommendations,
    overallConfidence,
    note: recommendations[0].explanation,
    identification: {
      name: name || null,
      category: category || null,
      brand: null,
      model: null,
      material: null,
      condition: condition || null,
      visibleDamage: null,
      ocrText: ocrText || null,
      uncertain: true,
      uncertaintyReason: "Identification is based only on what you entered.",
    },
  };
}



async function analyzeItem(input) {
  return heuristicAnalysis(input);
}

module.exports = { analyzeItem, ACTION_LABELS, VALID_ACTIONS, CATEGORY_OPTIONS, CONDITION_OPTIONS };
