let selectedFiles = [];
let currentItem = null;

function openScanner() {
  resetScanForm();
  const scanner = document.getElementById("scanner");
  scanner.classList.add("open");
  scanner.setAttribute("aria-hidden", "false");
}

function closeScanner() {
  const scanner = document.getElementById("scanner");
  scanner.classList.remove("open");
  scanner.setAttribute("aria-hidden", "true");
}

function resetScanForm() {
  const form = document.getElementById("scanForm");
  const result = document.getElementById("result");
  form.reset();
  form.classList.remove("hide");
  result.classList.remove("show");
  document.getElementById("scanFormMessage").textContent = "";
  document.getElementById("guidePanel").hidden = true;
  document.getElementById("correctionForm").hidden = true;
  document.getElementById("correctIdentificationButton").hidden = true;
  document.getElementById("qrScanMessage").textContent = "";
  document.getElementById("qrScanMessage").className = "qr-scan-message";
  document.getElementById("qrCodeImage").value = "";
  document.getElementById("chatLog").innerHTML = "";
  selectedFiles = [];
  currentItem = null;
  renderPhotoPreviews();
}

function renderPhotoPreviews() {
  const list = document.getElementById("photoPreviewList");
  list.innerHTML = "";
  selectedFiles.forEach((file, index) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.title = "Click to remove";
    img.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderPhotoPreviews();
    });
    list.appendChild(img);
  });
}

function setupPhotoInput() {
  const input = document.getElementById("itemPhotos");
  input.addEventListener("change", () => {
    const incoming = Array.from(input.files || []);
    selectedFiles = [...selectedFiles, ...incoming].slice(0, 6);
    input.value = ""; // allow re-selecting the same file / adding more later
    renderPhotoPreviews();
  });
}

async function showResult(item) {
  currentItem = item;
  document.getElementById("scanForm").classList.add("hide");
  document.getElementById("resultName").textContent = item.name;
  document.getElementById("resultScore").textContent = item.lifePotential;
  document.getElementById("resultNote").textContent = item.note;

  renderIdentification(document.getElementById("identificationBox"), item);
  const correctBtn = document.getElementById("correctIdentificationButton");
  correctBtn.hidden = false;

  renderRecommendations(
    { primaryEl: document.getElementById("recommendationPrimary"), alternativesEl: document.getElementById("recommendationAlternatives") },
    item,
    (action) => showGuide(item.id, action)
  );

  setupChatSection(document.getElementById("chatButtons"), document.getElementById("chatLog"), item.id);

  document.getElementById("saveItemButton").innerHTML = item.saved ? `${Icons.check()} Saved` : "Save this item";
  document.getElementById("actualActionSelect").value = item.userAction || "";

  document.getElementById("result").classList.add("show");
}

async function showGuide(itemId, type) {
  const panel = document.getElementById("guidePanel");
  const content = document.getElementById("guideContent");
  panel.hidden = false;
  content.innerHTML = "<p>Loading guide...</p>";
  try {
    const guide = await fetchGuide(itemId, type);
    renderGuideContent(content, type, guide);
  } catch (err) {
    content.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

function setupIdentificationCorrection() {
  document.getElementById("correctIdentificationButton").addEventListener("click", () => {
    if (!currentItem) return;
    document.getElementById("correctName").value = currentItem.name;
    document.getElementById("correctCategory").value = currentItem.category;
    document.getElementById("correctCondition").value = currentItem.condition;
    document.getElementById("correctionForm").hidden = false;
  });

  document.getElementById("submitCorrectionButton").addEventListener("click", async () => {
    if (!currentItem) return;
    const body = {
      name: document.getElementById("correctName").value.trim(),
      category: document.getElementById("correctCategory").value,
      condition: document.getElementById("correctCondition").value,
      recompute: true,
    };
    const response = await fetch(`${API_BASE}/items/${currentItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) {
      document.getElementById("correctionForm").hidden = true;
      showResult(data.item);
      loadDashboard();
    }
  });
}

function setupResultActions() {
  document.getElementById("saveItemButton").addEventListener("click", async () => {
    if (!currentItem) return;
    const nextSaved = !currentItem.saved;
    const response = await fetch(`${API_BASE}/items/${currentItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved: nextSaved }),
    });
    const data = await response.json();
    if (response.ok) {
      currentItem = data.item;
      document.getElementById("saveItemButton").innerHTML = currentItem.saved ? `${Icons.check()} Saved` : "Save this item";
      loadDashboard();
    }
  });

  document.getElementById("actualActionSelect").addEventListener("change", async (event) => {
    if (!currentItem) return;
    const userAction = event.target.value || null;
    const response = await fetch(`${API_BASE}/items/${currentItem.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAction }),
    });
    const data = await response.json();
    if (response.ok) {
      currentItem = data.item;
      loadDashboard();
      window.refreshNotifications?.();
    }
  });

  document.getElementById("closeGuideButton").addEventListener("click", () => {
    document.getElementById("guidePanel").hidden = true;
  });
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function renderStats(stats) {
  document.getElementById("statTotalItems").textContent = stats.totalItems;
  document.getElementById("statSecondLife").textContent = stats.itemsCompleted;
  document.getElementById("statValueSaved").textContent = formatCurrency(stats.estimatedValueSaved);

  document.getElementById("impactKept").textContent = stats.itemsCompleted;
  document.getElementById("impactMaterial").textContent = `${stats.materialKeptKg} kg`;
  document.getElementById("impactValue").textContent = formatCurrency(stats.estimatedValueSaved);
  document.getElementById("impactDecisions").textContent = stats.itemsCompleted;
}

function renderItemList(items) {
  const list = document.getElementById("itemList");
  const empty = document.getElementById("itemListEmpty");

  list.querySelectorAll(".item-card").forEach((card) => card.remove());

  if (!items.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  items.slice(0, 8).forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-card";

    const main = document.createElement("div");
    main.className = "item-card-main";
    const title = document.createElement("strong");
    title.textContent = item.name;
    const meta = document.createElement("span");
    meta.textContent = `${item.category} • ${item.condition}${item.userAction ? ` • You: ${item.userAction}` : ""}`;
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

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = `saved-star${item.saved ? " active" : ""}`;
    saveButton.innerHTML = item.saved ? `${Icons.star({ filled: true })} Saved` : `${Icons.star({ filled: false })} Save`;
    saveButton.addEventListener("click", () => toggleSaved(item.id, !item.saved));
    actions.appendChild(saveButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => deleteItem(item.id));
    actions.appendChild(deleteButton);

    card.append(main, score, actions);
    list.appendChild(card);
  });
}

async function loadDashboard() {
  try {
    const [statsResponse, itemsResponse] = await Promise.all([
      fetch(`${API_BASE}/items/stats`, { credentials: "include" }),
      fetch(`${API_BASE}/items?sort=newest&pageSize=8`, { credentials: "include" }),
    ]);
    if (statsResponse.ok) renderStats((await statsResponse.json()).stats);
    if (itemsResponse.ok) renderItemList((await itemsResponse.json()).items);
  } catch {
    // If this fails, the page still works — dashboard numbers just stay at 0.
  }
}

async function toggleSaved(id, saved) {
  await fetch(`${API_BASE}/items/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ saved }),
  });
  loadDashboard();
}

async function deleteItem(id) {
  await fetch(`${API_BASE}/items/${id}`, { method: "DELETE", credentials: "include" });
  loadDashboard();
}

function setupQrScan() {
  const button = document.getElementById("decodeQrButton");
  const fileInput = document.getElementById("qrCodeImage");
  const message = document.getElementById("qrScanMessage");

  button.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) {
      message.textContent = "Choose a photo containing a QR code first.";
      message.className = "qr-scan-message error";
      return;
    }

    message.textContent = "Decoding...";
    message.className = "qr-scan-message";
    button.disabled = true;

    try {
      const formData = new FormData();
      formData.append("codeImage", file);
      const response = await fetch(`${API_BASE}/items/scan-code`, { method: "POST", credentials: "include", body: formData });
      const data = await response.json();

      if (!response.ok) {
        message.textContent = data.message || "Could not decode a code from that photo.";
        message.className = "qr-scan-message error";
        return;
      }

      document.getElementById("itemName").value = data.code;
      message.textContent = `Decoded: "${data.code}" — filled into the name field. Feel free to edit it.`;
      message.className = "qr-scan-message success";
    } catch {
      message.textContent = "Could not reach the LifeLoop server.";
      message.className = "qr-scan-message error";
    } finally {
      button.disabled = false;
    }
  });
}

function setupScanForm() {
  const form = document.getElementById("scanForm");
  const submitButton = document.getElementById("scanSubmitButton");
  const message = document.getElementById("scanFormMessage");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Analyzing...";

    try {
      const formData = new FormData(form);
      formData.delete("photos");
      selectedFiles.forEach((file) => formData.append("photos", file));

      const response = await fetch(`${API_BASE}/items/scan`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        message.textContent = data.message || data.error || "Could not analyze this item. Please try again.";
        return;
      }

      await showResult(data.item);
      loadDashboard();
      window.refreshNotifications?.();
    } catch {
      message.textContent = "Could not reach the LifeLoop server. Is it running?";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Scan this item";
    }
  });

  document.getElementById("scanAgainButton").addEventListener("click", resetScanForm);
}

function setupScannerModalChrome() {
  const scanner = document.getElementById("scanner");
  scanner?.addEventListener("click", (event) => {
    if (event.target === scanner) closeScanner();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeScanner();
  });
}

(async function init() {
  const user = await requireLogin();
  if (!user) return; // requireLogin() already redirected to login.html

  initPageChrome(user);
  setupScannerModalChrome();
  setupPhotoInput();
  setupScanForm();
  setupQrScan();
  setupIdentificationCorrection();
  setupResultActions();
  loadDashboard();
})();
