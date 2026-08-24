let currentPage = 1;
let currentDetailItem = null;

function currentFilters() {
  return {
    search: document.getElementById("filterSearch").value.trim(),
    category: document.getElementById("filterCategory").value,
    condition: document.getElementById("filterCondition").value,
    action: document.getElementById("filterAction").value,
    completed: document.getElementById("filterCompleted").value,
    saved: document.getElementById("filterSaved").value,
    sort: document.getElementById("filterSort").value,
  };
}

function buildQuery(page) {
  const filters = currentFilters();
  const params = new URLSearchParams({ page, pageSize: 10 });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

async function loadPage(page) {
  currentPage = page;
  const response = await fetch(`${API_BASE}/items?${buildQuery(page)}`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  renderList(data.items);
  renderPagination(data.page, data.totalPages);
}

function renderList(items) {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  list.innerHTML = "";

  if (!items.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-card";

    const main = document.createElement("div");
    main.className = "item-card-main";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("span");
    meta.textContent = `${item.category} • ${item.condition}${item.userAction ? ` • You: ${item.userAction}` : " • Still in loop"}`;
    main.append(title, meta);

    const score = document.createElement("div");
    score.className = "item-card-score";
    score.textContent = `${item.lifePotential}/100`;

    const actions = document.createElement("div");
    actions.className = "item-card-actions";

    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = item.primaryActionLabel;
    actions.appendChild(pill);

    if (item.saved) {
      const savedTag = document.createElement("span");
      savedTag.className = "pill";
      savedTag.innerHTML = `${Icons.star({ filled: true })} Saved`;
      actions.appendChild(savedTag);
    }

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.textContent = "View details";
    viewButton.addEventListener("click", () => openDetail(item.id));
    actions.appendChild(viewButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", async () => {
      await fetch(`${API_BASE}/items/${item.id}`, { method: "DELETE", credentials: "include" });
      loadPage(currentPage);
    });
    actions.appendChild(deleteButton);

    card.append(main, score, actions);
    list.appendChild(card);
  });
}

function renderPagination(page, totalPages) {
  const container = document.getElementById("pagination");
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const prevButton = document.createElement("button");
  prevButton.textContent = "Prev";
  prevButton.disabled = page <= 1;
  prevButton.addEventListener("click", () => loadPage(page - 1));
  container.appendChild(prevButton);

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    const button = document.createElement("button");
    button.textContent = String(i);
    if (i === page) button.classList.add("active");
    button.addEventListener("click", () => loadPage(i));
    container.appendChild(button);
  }

  const nextButton = document.createElement("button");
  nextButton.textContent = "Next";
  nextButton.disabled = page >= totalPages;
  nextButton.addEventListener("click", () => loadPage(page + 1));
  container.appendChild(nextButton);
}

async function openDetail(id) {
  const response = await fetch(`${API_BASE}/items/${id}`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  currentDetailItem = data.item;
  document.getElementById("detailName").textContent = currentDetailItem.name;
  document.getElementById("detailScore").textContent = currentDetailItem.lifePotential;
  document.getElementById("detailNotes").value = currentDetailItem.notes || "";
  document.getElementById("detailActualAction").value = currentDetailItem.userAction || "";
  document.getElementById("detailSaveToggle").innerHTML = currentDetailItem.saved ? `${Icons.check()} Saved` : "Save this item";
  document.getElementById("detailGuidePanel").hidden = true;

  renderIdentification(document.getElementById("detailIdentificationBox"), currentDetailItem);
  renderRecommendations(
    { primaryEl: document.getElementById("detailRecommendationPrimary"), alternativesEl: document.getElementById("detailRecommendationAlternatives") },
    currentDetailItem,
    (action) => showDetailGuide(currentDetailItem.id, action)
  );

  document.getElementById("detailChatLog").innerHTML = "";
  setupChatSection(document.getElementById("detailChatButtons"), document.getElementById("detailChatLog"), currentDetailItem.id);

  const modal = document.getElementById("detailModal");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  const modal = document.getElementById("detailModal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  currentDetailItem = null;
}

async function showDetailGuide(itemId, type) {
  const panel = document.getElementById("detailGuidePanel");
  const content = document.getElementById("detailGuideContent");
  panel.hidden = false;
  content.innerHTML = "<p>Loading guide...</p>";
  try {
    const guide = await fetchGuide(itemId, type);
    renderGuideContent(content, type, guide);
  } catch (err) {
    content.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

function setupDetailModal() {
  document.getElementById("closeDetailButton").addEventListener("click", closeDetail);
  document.getElementById("detailCloseGuideButton").addEventListener("click", () => {
    document.getElementById("detailGuidePanel").hidden = true;
  });

  const modal = document.getElementById("detailModal");
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeDetail();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDetail();
  });

  document.getElementById("detailSaveToggle").addEventListener("click", async () => {
    if (!currentDetailItem) return;
    const nextSaved = !currentDetailItem.saved;
    const response = await fetch(`${API_BASE}/items/${currentDetailItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved: nextSaved }),
    });
    const data = await response.json();
    if (response.ok) {
      currentDetailItem = data.item;
      document.getElementById("detailSaveToggle").innerHTML = currentDetailItem.saved ? `${Icons.check()} Saved` : "Save this item";
      loadPage(currentPage);
    }
  });

  document.getElementById("detailActualAction").addEventListener("change", async (event) => {
    if (!currentDetailItem) return;
    const response = await fetch(`${API_BASE}/items/${currentDetailItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAction: event.target.value || null }),
    });
    const data = await response.json();
    if (response.ok) {
      currentDetailItem = data.item;
      loadPage(currentPage);
      window.refreshNotifications?.();
    }
  });

  document.getElementById("detailSaveNotes").addEventListener("click", async () => {
    if (!currentDetailItem) return;
    await fetch(`${API_BASE}/items/${currentDetailItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: document.getElementById("detailNotes").value }),
    });
  });
}

function setupFilters() {
  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };
  const reload = () => loadPage(1);
  document.getElementById("filterSearch").addEventListener("input", debounce(reload, 300));
  ["filterCategory", "filterCondition", "filterAction", "filterCompleted", "filterSaved", "filterSort"].forEach((id) => {
    document.getElementById(id).addEventListener("change", reload);
  });
}

(async function init() {
  const user = await requireLogin();
  if (!user) return;

  initPageChrome(user);
  setupFilters();
  setupDetailModal();
  loadPage(1);
})();
