// Shared "page chrome" behavior used by every authenticated page (header
// account menu, theme toggle, mobile nav, and filling in the signed-in
// user's name/avatar). Kept in one place so new pages stay consistent with
// the original page instead of drifting.

function fillUserChrome(user) {
  const displayName = user.name || user.email.split("@")[0];
  const firstLetter = displayName.charAt(0).toUpperCase();

  const navUserName = document.getElementById("navUserName");
  const accountName = document.getElementById("accountName");
  const accountEmail = document.getElementById("accountEmail");
  const userAvatar = document.getElementById("userAvatar");
  const welcomeHeading = document.getElementById("welcomeHeading");

  if (navUserName) navUserName.textContent = displayName;
  if (accountName) accountName.textContent = displayName;
  if (accountEmail) accountEmail.textContent = user.email;
  if (userAvatar) userAvatar.textContent = firstLetter;
  if (welcomeHeading) welcomeHeading.textContent = `Welcome back, ${displayName}. Give everything you own a`;
}

function setupAccountMenu() {
  const button = document.getElementById("accountButton");
  const panel = document.getElementById("accountPanel");
  const logoutButton = document.getElementById("logoutButton");

  button?.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
  });

  logoutButton?.addEventListener("click", logout);
  document.getElementById("headerLogoutButton")?.addEventListener("click", async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = "login.html";
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-menu")) {
      button?.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    }
  });
}

function setupTheme() {
  const button = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("lifeloopTheme") || "light";
  document.documentElement.dataset.theme = savedTheme;

  button?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("lifeloopTheme", nextTheme);
  });
}

function setupMobileNavigation() {
  const button = document.getElementById("mobileMenuButton");
  const links = document.getElementById("mainNavLinks");
  button?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
}

function setupNotifications() {
  const button = document.getElementById("notifButton");
  const panel = document.getElementById("notifPanel");
  const badge = document.getElementById("notifBadge");
  const list = document.getElementById("notifList");
  const markAllButton = document.getElementById("markAllReadButton");
  if (!button) return; // page doesn't have the notification bell

  function timeAgo(iso) {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function refresh() {
    try {
      const response = await fetch("/api/notifications", { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();

      if (data.unreadCount > 0) {
        badge.hidden = false;
        badge.textContent = data.unreadCount > 9 ? "9+" : String(data.unreadCount);
      } else {
        badge.hidden = true;
      }

      list.innerHTML = "";
      if (!data.notifications.length) {
        list.innerHTML = '<p class="notif-empty">No notifications yet.</p>';
        return;
      }
      data.notifications.forEach((n) => {
        const item = document.createElement(n.link ? "a" : "div");
        item.className = `notif-item${n.read ? "" : " unread"}`;
        if (n.link) item.href = n.link;
        item.innerHTML = `<strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.message)}</span><time>${timeAgo(n.createdAt)}</time>`;
        item.addEventListener("click", () => {
          if (!n.read) fetch(`/api/notifications/${n.id}/read`, { method: "POST", credentials: "include" });
        });
        list.appendChild(item);
      });
    } catch {
      // Notifications are a nice-to-have; a failed fetch shouldn't disrupt the page.
    }
  }

  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
    if (!isOpen) refresh();
  });

  markAllButton?.addEventListener("click", async (event) => {
    event.stopPropagation();
    await fetch("/api/notifications/read-all", { method: "POST", credentials: "include" });
    refresh();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".notification-menu")) {
      button.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    }
  });

  refresh();
  window.refreshNotifications = refresh;
}

function initPageChrome(user) {
  fillUserChrome(user);
  setupAccountMenu();
  setupTheme();
  setupMobileNavigation();
  setupNotifications();
}
