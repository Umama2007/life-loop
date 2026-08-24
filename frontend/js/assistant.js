let currentItem = null;

async function loadItems() {
  const response = await fetch(`${API_BASE}/items?pageSize=100`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  renderPicker(data.items);
}

function renderPicker(items) {
  const list = document.getElementById("pickerList");
  const empty = document.getElementById("pickerEmpty");
  list.innerHTML = "";

  if (!items.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "item-picker-card";
    
    const title = document.createElement("strong");
    title.className = "item-picker-title";
    title.textContent = item.name;
    
    const meta = document.createElement("span");
    meta.className = "item-picker-meta";
    meta.textContent = `${item.category} • ${item.condition}`;
    
    card.append(title, meta);
    
    card.addEventListener("click", () => {
      document.querySelectorAll(".item-picker-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      selectItem(item);
    });
    
    list.appendChild(card);
  });
}

function selectItem(item) {
  currentItem = item;
  
  document.getElementById("chatEmptyState").hidden = true;
  const activeState = document.getElementById("chatActiveState");
  activeState.hidden = false;
  
  document.getElementById("chatItemName").textContent = `Chatting about: ${item.name}`;
  
  const chatLog = document.getElementById("assistantChatLog");
  chatLog.innerHTML = "";
  
  setupChatSection(document.getElementById("assistantChatButtons"), chatLog, item.id);
}

(async function init() {
  const user = await requireLogin();
  if (!user) return;

  initPageChrome(user);
  loadItems();
})();
