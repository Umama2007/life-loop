// LifeLoop AI Service — a thin, provider-agnostic layer that the rest of
// the backend talks to instead of calling any specific AI vendor directly.
//
//   LifeLoop AI Service
//           |
//           +-- Gemini Provider  (active today)
//                   |
//                   +-- Gemini API
//
// Adding another provider later (OpenAI, a local model, etc.) means adding
// one more file under providers/ and one line in the PROVIDERS map below —
// nothing in recommendation.js, assistants.js, or anywhere else in the app
// needs to change.
//
// Every caller in this app already has its own built-in fallback for when
// this service is unavailable or fails (see recommendation.js's
// heuristicAnalysis and assistants.js's template-based guides) — this
// service's job is only to try the configured AI provider and report
// clearly why it didn't work, not to implement any fallback itself.

const geminiProvider = require("./providers/geminiProvider");

const PROVIDERS = {
  gemini: geminiProvider,
};

function getActiveProvider() {
  const name = process.env.AI_PROVIDER || "gemini";
  return PROVIDERS[name] || null;
}

function getActiveProviderName() {
  const name = process.env.AI_PROVIDER || "gemini";
  return PROVIDERS[name] ? name : null;
}

function isAvailable() {
  const provider = getActiveProvider();
  return Boolean(provider && provider.isConfigured());
}

// Returns parsed JSON from the active AI provider, or null if no provider
// is configured (e.g. no API key set — a normal, expected state). Throws a
// descriptive Error for any other failure so the caller can log it and use
// its own built-in fallback.
async function generateJSON(options) {
  const provider = getActiveProvider();
  if (!provider) {
    console.warn(`Unknown AI_PROVIDER "${process.env.AI_PROVIDER}" — no AI provider will be used.`);
    return null;
  }
  if (!provider.isConfigured()) return null;
  return provider.generateJSON(options);
}

module.exports = { generateJSON, isAvailable, getActiveProvider, getActiveProviderName };
