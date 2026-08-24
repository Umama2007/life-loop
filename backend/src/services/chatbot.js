// The LifeLoop assistant: answers a small, FIXED set of fast-check
// questions about a scanned item ("Can I recycle it?", "Can I repair it?",
// etc.) in 1-2 short sentences.
//
// This is deliberately NOT a general-purpose chatbot. There is no free-text
// input anywhere in this feature — the API only accepts one of the
// question types defined below. That's a stronger guarantee of staying
// on-topic than any system prompt could give: there is structurally no way
// to ask this endpoint "what's the capital of France?", because the
// endpoint doesn't accept arbitrary text at all.
//
// Like the rest of LifeLoop, every question has a built-in, offline answer
// that works with zero setup, and an AI-enhanced version used automatically
// when an AI provider (Gemini) is configured.
//
// IMPORTANT SAFETY DESIGN: recycling rules genuinely vary by material and
// location, and an AI model can sound confident while being wrong about
// local specifics. Rather than trust a prompt instruction to keep the model
// honest about this, the disposal-related answers below ALWAYS append a
// fixed, code-generated sentence pointing to LifeLoop's real nearby-places
// search (OpenStreetMap-backed, not AI-guessed) — this happens after the AI
// call, in code, so it holds true even if the model ignores its
// instructions.

const aiService = require("./ai");

const EWASTE_CATEGORIES = new Set(["electronics", "tech"]);
const MAX_ANSWER_LENGTH = 240; // defensive cap even if the model or template runs long

const NEARBY_POINTER = "Use LifeLoop's \"Find nearby recycling points\" to see real, current options near you.";

function scoreFor(item, action) {
  return item.recommendations?.find((r) => r.action === action)?.score ?? 0;
}
function explanationFor(item, action) {
  return item.recommendations?.find((r) => r.action === action)?.explanation || "";
}

function truncate(text, max = MAX_ANSWER_LENGTH) {
  const trimmed = (text || "").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

// ---- Built-in (offline) answers -----------------------------------------

const HEURISTIC_ANSWERS = {
  whatCanIDo: (item) =>
    `Based on its condition, ${item.primaryActionLabel.toLowerCase()} looks like the best option. ${explanationFor(item, item.primaryAction)}`,

  canIRecycle: (item) => {
    const isEwaste = EWASTE_CATEGORIES.has(item.category);
    return isEwaste
      ? "Yes, but not in regular household recycling — electronics need dedicated e-waste handling for batteries and components."
      : "Yes, most materials in everyday items can be recycled once separated from other parts.";
  },

  howToRecycle: (item) => {
    const isEwaste = EWASTE_CATEGORIES.has(item.category);
    return isEwaste
      ? "Remove any batteries if possible, then take it to an e-waste or electronics recycling point rather than regular recycling."
      : "Clean it and separate different materials (e.g. metal from fabric or plastic) before recycling.";
  },

  canIRepair: (item) => explanationFor(item, "repair") || `A repair could extend this item's life given its ${item.condition} condition.`,

  canIDonate: (item) => {
    const suitable = !["broken", "poor"].includes(item.condition);
    return suitable
      ? "Yes — it's usable enough that a donation center could likely still make use of it."
      : `In ${item.condition} condition, it may not be accepted for donation — recycling could be more appropriate.`;
  },

  canIReuse: (item) => explanationFor(item, "reuse") || "It could likely be repurposed for a different use around your home.",
};

// ---- AI-enhanced answers ---------------------------------------------------

const QUESTION_PROMPTS = {
  whatCanIDo: "What's the single best next step for this item, and why, in one short sentence?",
  canIRepair: "Is this item worth repairing? One short sentence with the key reason.",
  canIDonate: "Is this item suitable to donate as-is? One short sentence with the key reason.",
  canIReuse: "Give one short, concrete idea for reusing or repurposing this item instead of discarding it.",
};

async function aiAnswer(item, questionType) {
  if (!aiService.isAvailable()) return null;

  const prompt =
    `You are the LifeLoop assistant. You ONLY answer questions about what to do with the specific item ` +
    `described below (keep, repair, reuse, resell, donate, or recycle) — nothing else, ever.\n\n` +
    `Item: ${item.name}\nCategory: ${item.category}\nCondition: ${item.condition}\n` +
    `Age (years): ${item.ageYears ?? "unspecified"}\n\n` +
    `Question: ${QUESTION_PROMPTS[questionType]}\n\n` +
    `Respond with ONLY a JSON object: {"answer": "your response"}. The answer must be ONE or TWO short ` +
    `sentences (under 35 words total) — no lists, no headers, no lengthy explanation. Never invent or state ` +
    `specific local laws, regulations, facility names, or organizations you cannot verify.`;

  const parsed = await aiService.generateJSON({
    prompt,
    maxTokens: 500,
    schema: { type: "OBJECT", properties: { answer: { type: "STRING" } }, required: ["answer"] },
  });

  return parsed?.answer ? truncate(parsed.answer) : null;
}

const RECYCLING_QUESTION_TYPES = new Set(["canIRecycle", "howToRecycle"]);

async function answerQuestion(item, questionType) {
  if (!HEURISTIC_ANSWERS[questionType]) {
    throw new Error(`Unknown question type: ${questionType}`);
  }

  let answer;
  let source = "builtin";

  // Recycling questions never go to the AI at all — not even with a
  // filter-after-the-fact safety net. A model can still sound confident
  // while inventing a street name or facility, and catching that reliably
  // after generation isn't something a simple check can guarantee. The
  // built-in answer below is deterministic and reviewed; skipping the AI
  // call here removes the invented-specifics risk by construction rather
  // than trying to filter it out afterward.
  if (!RECYCLING_QUESTION_TYPES.has(questionType)) {
    try {
      const ai = await aiAnswer(item, questionType);
      if (ai) {
        answer = ai;
        source = aiService.getActiveProviderName() || "ai";
      }
    } catch (err) {
      console.warn(`LifeLoop assistant AI answer failed, using built-in answer: ${err.message}`);
    }
  }

  if (!answer) {
    answer = truncate(HEURISTIC_ANSWERS[questionType](item));
  }

  // Always point disposal-related answers to real, current nearby data
  // rather than anything AI-guessed or hardcoded.
  if (RECYCLING_QUESTION_TYPES.has(questionType)) {
    answer = `${answer} ${NEARBY_POINTER}`;
  }

  return { answer, source };
}

module.exports = { answerQuestion, QUESTION_TYPES: Object.keys(HEURISTIC_ANSWERS) };
