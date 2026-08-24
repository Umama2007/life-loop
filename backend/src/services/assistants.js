// Generates the deeper "what do I actually do now" guidance shown once a
// user has a recommendation: a repair guide, reuse ideas, a resale listing
// draft, donation guidance, or recycling guidance.
//
// Each has a transparent, template-based fallback that works with zero
// setup, and an AI-powered version used automatically when an AI provider
// (Gemini, via services/ai) is configured. If that call fails or returns
// something we can't parse, we fall back to the template version rather
// than showing an error — these are advisory features, not the item record
// itself, so they should never block the user.

const aiService = require("./ai");

const DANGEROUS_REPAIR_CATEGORIES = ["electronics", "tech"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function callAiJSON(prompt, images, maxTokens = 700) {
  if (!aiService.isAvailable()) return null;
  return aiService.generateJSON({ prompt, images, maxTokens });
}

function itemContext(item) {
  return (
    `Item name: ${item.name}\nCategory: ${item.category}\nCondition: ${item.condition}\n` +
    `Age (years): ${item.ageYears ?? "unspecified"}\nVisible damage: ${item.identification?.visibleDamage || "unspecified"}`
  );
}

// ---- Repair -----------------------------------------------------------

async function getRepairGuide(item, images) {
  const isDangerousCategory = DANGEROUS_REPAIR_CATEGORIES.includes((item.category || "").toLowerCase());

  try {
    const prompt =
      `You are LifeLoop's repair assistant. Based on the item below, produce ONLY a JSON object with this shape:\n` +
      `{"problemDetected": <string>, "possibleCause": <string>, "difficulty": <"easy"|"moderate"|"hard">, ` +
      `"materialsNeeded": [<strings>], "toolsNeeded": [<strings>], "approachSteps": [<3-6 short strings, general guidance only, ` +
      `never step-by-step instructions for working with electricity, gas lines, or high-voltage components>], ` +
      `"maintenanceAdvice": <string>, "whenToSeekProfessional": <string>}\n\n${itemContext(item)}\n\n` +
      (isDangerousCategory
        ? `This item may involve electrical components. Keep "approachSteps" high-level and safety-conscious — ` +
          `defer any wiring, battery, or power-supply work to "whenToSeekProfessional" rather than giving instructions.\n\n`
        : "");
    const parsed = await callAiJSON(prompt, images);
    if (parsed) return { source: aiService.getActiveProviderName() || "ai", ...parsed };
  } catch (err) {
    console.warn("AI repair guide generation failed, using built-in template:", err.message);
  }

  return {
    source: "builtin",
    problemDetected: `General wear consistent with a ${item.condition} condition ${item.category} item.`,
    possibleCause: "Normal use over time, or a specific fault you noticed during the scan.",
    difficulty: item.condition === "broken" ? "hard" : "moderate",
    materialsNeeded: ["Cleaning cloth", "Basic replacement parts if applicable (check manufacturer info)"],
    toolsNeeded: isDangerousCategory ? ["No tools recommended — see a professional for this category"] : ["Screwdriver set", "Adhesive or thread, depending on the item"],
    approachSteps: isDangerousCategory
      ? [
          "Inspect the item and note any visible external damage.",
          "Check the manufacturer's site for known issues or recall notices.",
          "For anything involving power, batteries, or wiring, stop here and consult a professional.",
        ]
      : [
          "Clean the item thoroughly to see the full extent of any damage.",
          "Identify the specific broken or worn part.",
          "Look up a repair guide or tutorial for this specific item type.",
          "Gather the tools/materials needed before starting.",
          "Test the item after the repair before returning it to regular use.",
        ],
    maintenanceAdvice: "Regular cleaning and careful storage will extend the life of most repaired items.",
    whenToSeekProfessional: isDangerousCategory
      ? "Any repair involving electrical wiring, batteries, or power components should be handled by a qualified technician."
      : "If the repair requires specialized tools you don't have, or the item has structural/safety-critical damage, consider a professional repair service instead.",
  };
}

// ---- Reuse --------------------------------------------------------------

async function getReuseIdeas(item, images) {
  try {
    const prompt =
      `You are LifeLoop's reuse-idea assistant. Based on the item below, produce ONLY a JSON object: ` +
      `{"ideas": [{"title": <string>, "description": <string>, "difficulty": <"easy"|"moderate"|"hard">, ` +
      `"materials": [<strings>], "steps": [<2-5 short strings>]}, ... 3 to 5 distinct, realistic ideas]}\n\n${itemContext(item)}`;
    const parsed = await callAiJSON(prompt, images);
    if (parsed?.ideas?.length) return { source: aiService.getActiveProviderName() || "ai", ideas: parsed.ideas };
  } catch (err) {
    console.warn("AI reuse ideas generation failed, using built-in template:", err.message);
  }

  const genericIdeas = {
    clothing: [
      { title: "Turn it into a tote bag", description: "Repurpose sturdy fabric into a simple carry bag.", difficulty: "moderate", materials: ["Scissors", "Needle and thread or sewing machine"], steps: ["Cut along the seams you don't need", "Reinforce the edges", "Add straps"] },
      { title: "Use as cleaning rags", description: "Worn fabric works well for household cleaning.", difficulty: "easy", materials: ["Scissors"], steps: ["Cut into manageable squares", "Store with cleaning supplies"] },
    ],
    home: [
      { title: "Repurpose as storage", description: "Use the item to organize another part of your home.", difficulty: "easy", materials: [], steps: ["Clean the item", "Find a new spot for it to hold something else"] },
      { title: "Turn into a planter", description: "Many household items make characterful plant containers.", difficulty: "easy", materials: ["Potting soil", "Drainage material"], steps: ["Add drainage holes if needed", "Add soil and a plant"] },
    ],
    furniture: [
      { title: "Refinish and repurpose", description: "A coat of paint or new hardware can give old furniture a new role.", difficulty: "moderate", materials: ["Sandpaper", "Paint or stain"], steps: ["Sand the surface", "Apply new finish", "Reassemble"] },
    ],
    electronics: [
      { title: "Repurpose components", description: "Some parts (cables, casings, batteries where safe) can be reused elsewhere.", difficulty: "hard", materials: ["Basic tools"], steps: ["Check for reusable parts", "Recycle anything you can't reuse safely"] },
    ],
  };
  const ideas = genericIdeas[(item.category || "").toLowerCase()] || [
    { title: "Repurpose for storage or organization", description: `Consider a second use for ${item.name} around your home.`, difficulty: "easy", materials: [], steps: ["Think about a different need this item's shape or material could serve", "Clean it up before reusing"] },
  ];
  return { source: "builtin", ideas };
}

// ---- Resale ---------------------------------------------------------------

async function getResaleListing(item, images) {
  try {
    const prompt =
      `You are LifeLoop's resale assistant. Based on the item below, produce ONLY a JSON object: ` +
      `{"title": <string, good listing title>, "description": <string, 2-4 sentences>, "suggestedCategory": <string>, ` +
      `"conditionDescription": <string>, "suggestedPriceRange": <string like "₹500–800", or "Not enough information to estimate a price" ` +
      `if you genuinely can't tell>, "sellerChecklist": [<strings>], "recommendedPhotos": [<strings>], "keyDetailsToMention": [<strings>]}\n\n${itemContext(item)}`;
    const parsed = await callAiJSON(prompt, images);
    if (parsed) return { source: aiService.getActiveProviderName() || "ai", ...parsed, disclaimer: "AI-generated price estimates are estimates only, not guaranteed market values." };
  } catch (err) {
    console.warn("AI resale listing generation failed, using built-in template:", err.message);
  }

  return {
    source: "builtin",
    title: `${item.name} — ${item.condition} condition`,
    description: `${item.name} in ${item.condition} condition, approximately ${item.ageYears ?? "unknown"} year(s) old. Available for pickup or shipping — see photos for full condition details.`,
    suggestedCategory: item.category,
    conditionDescription: `${item.condition}${item.identification?.visibleDamage ? ` — ${item.identification.visibleDamage}` : ""}`,
    suggestedPriceRange: "Not enough information to estimate a price — check similar listings for this item locally.",
    sellerChecklist: ["Clean the item before photographing", "Take photos in good lighting from multiple angles", "Note any flaws honestly in the description", "Respond promptly to buyer questions"],
    recommendedPhotos: ["Front view", "Back view", "Any visible damage or wear", "Brand/model label if present"],
    keyDetailsToMention: ["Age", "Condition", "Reason for selling", "Any accessories included"],
    disclaimer: "AI-generated price estimates are estimates only, not guaranteed market values.",
  };
}

// ---- Donation ---------------------------------------------------------------

async function getDonationGuidance(item) {
  try {
    const prompt =
      `You are LifeLoop's donation assistant. Based on the item below, produce ONLY a JSON object: ` +
      `{"suitable": <boolean>, "reason": <string>, "suggestedCategories": [<strings, general donation categories like "clothing donation", "furniture donation", NOT specific named charities>], ` +
      `"preparationSteps": [<strings>], "infoToProvideRecipient": [<strings>]}\n\n${itemContext(item)}\n\n` +
      `Do not name specific real organizations — you don't have reliable, current data on them.`;
    const parsed = await callAiJSON(prompt);
    if (parsed) return { source: aiService.getActiveProviderName() || "ai", ...parsed };
  } catch (err) {
    console.warn("AI donation guidance generation failed, using built-in template:", err.message);
  }

  const suitable = !["broken", "poor"].includes((item.condition || "").toLowerCase());
  return {
    source: "builtin",
    suitable,
    reason: suitable
      ? `${item.name} is still functional/usable, which makes it a good donation candidate.`
      : `${item.name} is in ${item.condition} condition, which may make it unsuitable for most donation programs — recycling may be more appropriate.`,
    suggestedCategories: [`${item.category} donation`],
    preparationSteps: ["Clean the item", "Check it's complete (all parts/accessories included)", "Note any flaws so the recipient organization can decide if it's usable"],
    infoToProvideRecipient: ["Item condition", "Age", "Any known issues"],
  };
}

// ---- Recycling ---------------------------------------------------------------

async function getRecyclingGuidance(item) {
  try {
    const prompt =
      `You are LifeLoop's recycling assistant. Based on the item below, produce ONLY a JSON object: ` +
      `{"material": <string, or "unknown" if you can't tell>, "itemType": <string>, "appropriate": <boolean>, ` +
      `"preparationSteps": [<strings>], "partsNeedingSeparateHandling": [<strings, or empty array>]}\n\n${itemContext(item)}`;
    const parsed = await callAiJSON(prompt);
    if (parsed) return { source: aiService.getActiveProviderName() || "ai", ...parsed };
  } catch (err) {
    console.warn("AI recycling guidance generation failed, using built-in template:", err.message);
  }

  const categoryMaterialGuess = {
    electronics: "mixed metals/plastics (e-waste)",
    tech: "mixed metals/plastics (e-waste)",
    furniture: "wood/composite materials",
    clothing: "textile",
    home: "mixed materials",
  };
  const material = item.identification?.material || categoryMaterialGuess[(item.category || "").toLowerCase()] || "unknown — check local guidelines";
  const isEwaste = ["electronics", "tech"].includes((item.category || "").toLowerCase());

  return {
    source: "builtin",
    material,
    itemType: item.category,
    appropriate: true,
    preparationSteps: isEwaste
      ? ["Remove batteries if possible and recycle separately", "Wipe any personal data if applicable", "Take to an e-waste collection point rather than general recycling"]
      : ["Clean the item of any food or liquid residue", "Separate materials if the item is made of more than one (e.g. remove metal parts from fabric/wood)"],
    partsNeedingSeparateHandling: isEwaste ? ["Batteries", "Any glass components"] : [],
  };
}

module.exports = { getRepairGuide, getReuseIdeas, getResaleListing, getDonationGuidance, getRecyclingGuidance };
