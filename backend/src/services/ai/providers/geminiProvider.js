// Gemini provider for the LifeLoop AI service. Talks to Google's
// Generative Language API directly over HTTPS (https://ai.google.dev/api) —
// no SDK dependency, so nothing extra needs installing.
//
// This module knows nothing about items, recommendations, or guides — it
// only knows how to send a prompt (with optional images and an optional
// response schema) to Gemini and return parsed JSON, or throw a clear,
// categorized error. The caller decides what to do on failure (LifeLoop's
// callers all fall back to the built-in engine — see recommendation.js and
// assistants.js).
//
// SECURITY NOTE: the API key is passed as a URL query parameter, per
// Gemini's REST API. Never log the constructed URL — log only the model
// name and high-level outcome instead.

const DEFAULT_REQUEST_TIMEOUT_MS = 25000;

function getTimeoutMs() {
  const configured = Number.parseInt(process.env.GEMINI_TIMEOUT_MS, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_MS;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getModel() {
  // gemini-1.5-flash supports multimodal (text + image) input and has been
  // available on Google AI Studio's free tier. Google's free-tier model
  // lineup changes over time, so this is intentionally overridable —
  // check https://ai.google.dev/pricing for what's currently free and set
  // GEMINI_MODEL in backend/.env if you want a different model.
  return process.env.GEMINI_MODEL || "gemini-1.5-flash";
}

function buildParts(prompt, images) {
  const parts = [{ text: prompt }];
  for (const image of images || []) {
    if (image?.base64 && image?.mediaType) {
      parts.push({ inline_data: { mime_type: image.mediaType, data: image.base64 } });
    }
  }
  return parts;
}

function categorizeHttpError(status, bodyText) {
  const safeBody = (bodyText || "").slice(0, 300);
  if (status === 400) return new Error(`Gemini rejected the request — check the image format or prompt (${safeBody})`);
  if (status === 401 || status === 403) return new Error("Gemini API key is invalid or unauthorized");
  if (status === 404) return new Error(`Gemini model not found — check GEMINI_MODEL (${safeBody})`);
  if (status === 429) return new Error("Gemini rate limit or quota exceeded");
  if (status >= 500) return new Error(`Gemini service error (status ${status})`);
  return new Error(`Gemini API error: ${status} ${safeBody}`);
}

// Returns parsed JSON on success, or null if Gemini isn't configured at
// all (no key set — this is a normal, expected state, not a failure).
// Throws a descriptive Error for every other failure mode so the caller
// can log it and fall back to the built-in engine.
async function generateJSON({ prompt, images = [], maxTokens = 900, schema = null }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = getModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig = {
    maxOutputTokens: maxTokens,
    responseMimeType: "application/json",
  };
  if (schema) generationConfig.responseSchema = schema;

  const body = {
    contents: [{ role: "user", parts: buildParts(prompt, images) }],
    generationConfig,
  };

  console.log(`Gemini request started (model: ${model})`);

  const controller = new AbortController();
  // Guarded: on some Node/undici versions, calling abort() on a signal
  // whose request has *already* settled can itself throw synchronously.
  // Since this callback runs inside setTimeout (not inside the try/catch
  // below), an unguarded throw here would be a genuinely uncaught
  // exception that crashes the entire server process — not just this
  // request. This is exactly what was happening before this fix.
  const timeoutHandle = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // Already settled or otherwise unabortable — nothing to do.
    }
  }, getTimeoutMs());

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = err.name === "AbortError" ? new Error("Gemini request timed out") : new Error(`Gemini network error: ${err.message}`);
    console.warn(`Gemini request failed: ${wrapped.message}`);
    throw wrapped;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const err = categorizeHttpError(response.status, bodyText);
    console.warn(`Gemini request failed: ${err.message}`);
    throw err;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const err = new Error("Gemini returned an invalid (non-JSON) response");
    console.warn(`Gemini request failed: ${err.message}`);
    throw err;
  }

  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    const err = new Error(`Gemini declined to respond (${finishReason})`);
    console.warn(`Gemini request failed: ${err.message}`);
    throw err;
  }

  const textOut = candidate?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!textOut) {
    const err = new Error("Gemini returned an empty response");
    console.warn(`Gemini request failed: ${err.message}`);
    throw err;
  }

  const cleaned = textOut.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const err = new Error("Gemini returned a response that could not be parsed as JSON");
    console.warn(`Gemini request failed: ${err.message}`);
    throw err;
  }

  console.log("Gemini response successfully processed");
  return parsed;
}

module.exports = { isConfigured, getModel, generateJSON };
