// Shared rendering helpers for showing an item's identification, ranked
// recommendations, and AI guides (repair/reuse/resell/donate/recycle).
// Used both by the scanner result panel (script.js) and the item detail
// view on the History page (history.js), so the two stay consistent.
//
// Relies on API_BASE_URL already being declared by config.js, which every page
// that includes this file loads first.

const ACTION_LABELS = {
  keep: "Keep using",
  repair: "Repair",
  reuse: "Reuse",
  resell: "Resell",
  donate: "Donate",
  recycle: "Recycle",
};

const GUIDE_ACTIONS = ["repair", "reuse", "resell", "donate", "recycle"];

function renderIdentification(container, item) {
  if (!container) return;
  const id = item.identification || {};
  const parts = [];
  if (id.brand) parts.push(`Brand: ${id.brand}`);
  if (id.model) parts.push(`Model: ${id.model}`);
  if (id.material) parts.push(`Material: ${id.material}`);
  if (id.visibleDamage) parts.push(`Visible damage: ${id.visibleDamage}`);

  const summaryEl = container.querySelector("[data-id-summary]");
  const uncertaintyEl = container.querySelector("[data-id-uncertainty]");

  if (summaryEl) summaryEl.textContent = parts.length ? parts.join(" • ") : "No additional identification details.";
  if (uncertaintyEl) {
    uncertaintyEl.innerHTML = id.uncertain
      ? `<span class="inline-warning">${Icons.alertTriangle()}</span> ${escapeHtml(id.uncertaintyReason || "This identification is uncertain.")}`
      : (id.correctedByUser ? `<span class="inline-check">${Icons.check()}</span> Confirmed by you.` : "");
  }
  container.hidden = false;
}

function renderRecommendations({ primaryEl, alternativesEl }, item, onViewGuide) {
  const [top, ...rest] = item.recommendations || [];
  if (!top) return;

  if (primaryEl) {
    primaryEl.innerHTML = "";
    const actionLine = document.createElement("div");
    const actionSpan = document.createElement("span");
    actionSpan.className = "rec-action";
    actionSpan.textContent = ACTION_LABELS[top.action] || top.action;
    const confSpan = document.createElement("span");
    confSpan.className = "rec-confidence";
    confSpan.textContent = `${top.confidence} confidence`;
    actionLine.append(actionSpan, confSpan);

    const explanation = document.createElement("p");
    explanation.className = "rec-explanation";
    explanation.textContent = top.explanation;

    primaryEl.append(actionLine, explanation);

    if (GUIDE_ACTIONS.includes(top.action) && onViewGuide) {
      const guideButton = document.createElement("button");
      guideButton.type = "button";
      guideButton.className = "text-button-inline";
      guideButton.style.marginTop = "8px";
      guideButton.textContent = `View ${ACTION_LABELS[top.action].toLowerCase()} guide`;
      guideButton.addEventListener("click", () => onViewGuide(top.action));
      primaryEl.appendChild(guideButton);
    }
  }

  if (alternativesEl) {
    alternativesEl.innerHTML = "";
    rest.forEach((rec) => {
      const row = document.createElement("div");
      row.className = "rec-alt-row";

      const label = document.createElement("span");
      label.textContent = ACTION_LABELS[rec.action] || rec.action;

      const score = document.createElement("span");
      score.className = "rec-alt-score";
      score.textContent = `${rec.score}/100 • ${rec.confidence}`;

      row.append(label, score);

      if (GUIDE_ACTIONS.includes(rec.action) && onViewGuide) {
        const guideButton = document.createElement("button");
        guideButton.type = "button";
        guideButton.textContent = "Guide";
        guideButton.addEventListener("click", () => onViewGuide(rec.action));
        row.appendChild(guideButton);
      }

      alternativesEl.appendChild(row);
    });
  }
}

async function fetchGuide(itemId, type, { regenerate = false } = {}) {
  const response = await fetch(`${API_BASE_URL}/items/${itemId}/assistant/${type}?regenerate=${regenerate}`, {
    credentials: "include",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Could not load this guide.");
  if (data.guide) return data.guide;
  throw new Error("Unexpected response while generating this guide.");
}

function renderGuideContent(container, type, guide) {
  container.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = `${ACTION_LABELS[type]} guide`;
  container.appendChild(title);

  function addField(label, value) {
    if (!value) return;
    const p = document.createElement("p");
    p.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}`;
    container.appendChild(p);
  }
  function addList(label, items) {
    if (!items || !items.length) return;
    const heading = document.createElement("div");
    heading.className = "guide-section-label";
    heading.textContent = label;
    container.appendChild(heading);
    const ul = document.createElement("ul");
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  if (type === "repair") {
    addField("Problem detected", guide.problemDetected);
    addField("Possible cause", guide.possibleCause);
    addField("Difficulty", guide.difficulty);
    addList("Materials needed", guide.materialsNeeded);
    addList("Tools needed", guide.toolsNeeded);
    addList("Approach", guide.approachSteps);
    addField("Maintenance advice", guide.maintenanceAdvice);
    addField("When to seek professional help", guide.whenToSeekProfessional);
  } else if (type === "reuse") {
    (guide.ideas || []).forEach((idea) => {
      const heading = document.createElement("div");
      heading.className = "guide-section-label";
      heading.textContent = `${idea.title} (${idea.difficulty})`;
      container.appendChild(heading);
      const desc = document.createElement("p");
      desc.textContent = idea.description;
      container.appendChild(desc);
      addList("Materials", idea.materials);
      addList("Steps", idea.steps);
    });
  } else if (type === "resell") {
    addField("Suggested title", guide.title);
    addField("Description", guide.description);
    addField("Suggested category", guide.suggestedCategory);
    addField("Condition description", guide.conditionDescription);
    addField("Suggested price range", guide.suggestedPriceRange);
    addList("Seller checklist", guide.sellerChecklist);
    addList("Recommended photos", guide.recommendedPhotos);
    addList("Key details to mention", guide.keyDetailsToMention);
    if (guide.disclaimer) {
      const disclaimer = document.createElement("p");
      disclaimer.className = "guide-disclaimer";
      disclaimer.textContent = guide.disclaimer;
      container.appendChild(disclaimer);
    }
  } else if (type === "donate") {
    addField("Suitable for donation?", guide.suitable ? "Yes" : "Possibly not");
    addField("Why", guide.reason);
    addList("Suggested donation categories", guide.suggestedCategories);
    addList("How to prepare it", guide.preparationSteps);
    addList("Info to give the recipient", guide.infoToProvideRecipient);
  } else if (type === "recycle") {
    addField("Material", guide.material);
    addField("Item type", guide.itemType);
    addField("Appropriate for recycling?", guide.appropriate ? "Yes" : "Check locally");
    addList("Preparation steps", guide.preparationSteps);
    addList("Parts needing separate handling", guide.partsNeedingSeparateHandling);
  }

  if (["donate", "resell", "repair", "recycle"].includes(type)) {
    renderNearbySection(container, type);
  }
}

const NEARBY_LABELS = {
  donate: "donation centers",
  resell: "resale/second-hand shops",
  repair: "repair shops",
  recycle: "recycling points",
};

function renderNearbySection(container, action) {
  const section = document.createElement("div");
  section.className = "nearby-section";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button-inline";
  button.textContent = `Find nearby ${NEARBY_LABELS[action]}`;
  section.appendChild(button);

  const resultsEl = document.createElement("div");
  resultsEl.className = "nearby-results";
  resultsEl.hidden = true;
  section.appendChild(resultsEl);

  button.addEventListener("click", () => findAndRenderNearby(action, button, resultsEl));

  container.appendChild(section);
}

function findAndRenderNearby(action, button, resultsEl) {
  if (!navigator.geolocation) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = "<p class='nearby-message'>Your browser doesn't support location lookup.</p>";
    return;
  }

  button.disabled = true;
  button.textContent = "Finding your location...";
  resultsEl.hidden = false;
  resultsEl.innerHTML = "";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      button.textContent = "Searching nearby...";
      try {
        const { latitude, longitude } = position.coords;
        const response = await fetch(`${API_BASE_URL}/nearby?lat=${latitude}&lng=${longitude}&action=${action}`, {
          credentials: "include",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not search for nearby places.");
        renderNearbyResults(resultsEl, data);
      } catch (err) {
        resultsEl.innerHTML = `<p class="nearby-message">${escapeHtml(err.message)}</p>`;
      } finally {
        button.disabled = false;
        button.textContent = `Find nearby ${NEARBY_LABELS[action]}`;
      }
    },
    (geoError) => {
      const messages = {
        1: "Location access was denied. Enable it in your browser settings to find nearby options.",
        2: "Your location couldn't be determined right now.",
        3: "Getting your location took too long. Please try again.",
      };
      resultsEl.innerHTML = `<p class="nearby-message">${escapeHtml(messages[geoError.code] || "Could not get your location.")}</p>`;
      button.disabled = false;
      button.textContent = `Find nearby ${NEARBY_LABELS[action]}`;
    },
    { timeout: 10000 }
  );
}

function renderNearbyResults(resultsEl, data) {
  resultsEl.innerHTML = "";

  if (!data.places || !data.places.length) {
    resultsEl.innerHTML = "<p class='nearby-message'>No nearby options found in this area — OpenStreetMap coverage varies by location.</p>";
    return;
  }

  data.places.forEach((place) => {
    const card = document.createElement("a");
    card.href = place.mapUrl;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.className = "nearby-place";
    const distanceKm = (place.distanceMeters / 1000).toFixed(1);
    card.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <span>${place.address ? escapeHtml(place.address) + " • " : ""}${distanceKm} km away</span>
    `;
    resultsEl.appendChild(card);
  });

  const note = document.createElement("p");
  note.className = "nearby-note";
  note.textContent = data.note || "";
  resultsEl.appendChild(note);
}

// ---- Ask LifeLoop (fixed fast-check questions) ---------------------------
// Deliberately buttons-only — there is no text input here, and none should
// ever be added without also reconsidering how to keep this on-topic. The
// six questions below are the entire surface of this feature.

function setupChatSection(buttonsContainer, logContainer, itemId) {
  if (!buttonsContainer || !logContainer) return;
  logContainer.innerHTML = "";

  buttonsContainer.querySelectorAll("button[data-question]").forEach((button) => {
    // Avoid stacking duplicate listeners if this is called again for a
    // freshly-rendered result (e.g. after "Scan another item").
    const freshButton = button.cloneNode(true);
    button.replaceWith(freshButton);

    freshButton.addEventListener("click", async () => {
      const question = freshButton.textContent;
      const questionType = freshButton.dataset.question;

      const askedEl = document.createElement("div");
      askedEl.className = "chat-bubble chat-bubble-question";
      askedEl.textContent = question;
      logContainer.appendChild(askedEl);

      const answerEl = document.createElement("div");
      answerEl.className = "chat-bubble chat-bubble-answer";
      answerEl.textContent = "Thinking...";
      logContainer.appendChild(answerEl);
      logContainer.scrollTop = logContainer.scrollHeight;

      freshButton.disabled = true;
      try {
        const response = await fetch(`${API_BASE_URL}/items/${itemId}/chat/${questionType}`, { credentials: "include" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not get an answer right now.");
        answerEl.textContent = data.answer;
      } catch (err) {
        answerEl.textContent = err.message;
        answerEl.classList.add("chat-bubble-error");
      } finally {
        freshButton.disabled = false;
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    });
  });
}
