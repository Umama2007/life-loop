let me = null;
let currentPage = 1;

async function loadFeed(page) {
  currentPage = page;
  const response = await fetch(`${API_BASE_URL}/community/posts?page=${page}&pageSize=10`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  const list = document.getElementById("feedList");
  list.innerHTML = "";
  data.posts.forEach((post) => list.appendChild(buildPostCard(post)));
  renderFeedPagination(data.page, data.totalPages);
}

function buildPostCard(post) {
  const card = renderPostCard(post, me.id, {
    onLike: async (p, like) => {
      await fetch(`${API_BASE_URL}/community/posts/${p.id}/like`, {
        method: like ? "POST" : "DELETE",
        credentials: "include",
      });
      loadFeed(currentPage);
    },
    onToggleComments: async (p, section) => {
      if (!section.hidden) {
        section.hidden = true;
        return;
      }
      section.hidden = false;
      section.innerHTML = "<p>Loading comments...</p>";
      const response = await fetch(`${API_BASE_URL}/community/posts/${p.id}`, { credentials: "include" });
      const data = await response.json();
      renderComments(section, data.comments, me.id, {
        onAddComment: async (text) => {
          await fetch(`${API_BASE_URL}/community/posts/${p.id}/comments`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          loadFeed(currentPage);
        },
        onDeleteComment: async (comment) => {
          await fetch(`${API_BASE_URL}/community/comments/${comment.id}`, { method: "DELETE", credentials: "include" });
          loadFeed(currentPage);
        },
      });
    },
    onEdit: async (p) => {
      const next = window.prompt("Edit your post:", p.description);
      if (next === null) return;
      await fetch(`${API_BASE_URL}/community/posts/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: next }),
      });
      loadFeed(currentPage);
    },
    onDelete: async (p) => {
      if (!window.confirm("Delete this post?")) return;
      await fetch(`${API_BASE_URL}/community/posts/${p.id}`, { method: "DELETE", credentials: "include" });
      loadFeed(currentPage);
    },
    onReport: async (p) => {
      const reason = window.prompt("Why are you reporting this post?");
      if (!reason) return;
      await fetch(`${API_BASE_URL}/community/report`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "post", targetId: p.id, reason }),
      });
      window.alert("Thanks — this post has been reported to our moderators.");
    },
  });
  return card;
}

function renderFeedPagination(page, totalPages) {
  const container = document.getElementById("feedPagination");
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const prevButton = document.createElement("button");
  prevButton.textContent = "Prev";
  prevButton.disabled = page <= 1;
  prevButton.addEventListener("click", () => loadFeed(page - 1));
  container.appendChild(prevButton);

  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    const button = document.createElement("button");
    button.textContent = String(i);
    if (i === page) button.classList.add("active");
    button.addEventListener("click", () => loadFeed(i));
    container.appendChild(button);
  }

  const nextButton = document.createElement("button");
  nextButton.textContent = "Next";
  nextButton.disabled = page >= totalPages;
  nextButton.addEventListener("click", () => loadFeed(page + 1));
  container.appendChild(nextButton);
}

function setupCreatePost() {
  const form = document.getElementById("createPostForm");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("postFormMessage");
    message.textContent = "";

    const formData = new FormData();
    formData.append("description", document.getElementById("postDescription").value);
    const before = document.getElementById("postBeforeImage").files[0];
    const after = document.getElementById("postAfterImage").files[0];
    if (before) formData.append("beforeImage", before);
    if (after) formData.append("afterImage", after);

    const response = await fetch(`${API_BASE_URL}/community/posts`, { method: "POST", credentials: "include", body: formData });
    const data = await response.json();
    if (!response.ok) {
      message.textContent = data.message || "Could not create post.";
      return;
    }
    form.reset();
    loadFeed(1);
    window.refreshNotifications?.();
  });
}

function setupSearch() {
  const input = document.getElementById("communitySearch");
  const results = document.getElementById("searchResults");
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) {
        results.hidden = true;
        return;
      }
      const response = await fetch(`${API_BASE_URL}/community/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const data = await response.json();
      results.hidden = false;
      results.innerHTML = "";

      if (data.users.length) {
        const heading = document.createElement("div");
        heading.className = "guide-section-label";
        heading.textContent = "People";
        results.appendChild(heading);
        data.users.forEach((u) => {
          const link = document.createElement("a");
          link.href = `profile.html?id=${u.id}`;
          link.className = "post-author-link";
          link.style.display = "block";
          link.textContent = u.name;
          results.appendChild(link);
        });
      }
      if (data.posts.length) {
        const heading = document.createElement("div");
        heading.className = "guide-section-label";
        heading.textContent = "Posts";
        results.appendChild(heading);
        data.posts.forEach((p) => results.appendChild(buildPostCard(p)));
      }
      if (!data.users.length && !data.posts.length) {
        results.innerHTML = "<p>No results.</p>";
      }
    }, 300);
  });
}

async function loadLeaderboard() {
  const response = await fetch(`${API_BASE_URL}/community/leaderboard`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  const list = document.getElementById("leaderboardList");
  list.innerHTML = "";
  data.leaderboard.slice(0, 10).forEach((row) => {
    const el = document.createElement("div");
    el.className = "leaderboard-row";
    el.innerHTML = `<span class="leaderboard-rank">#${row.rank}</span><span class="leaderboard-name">${escapeHtml(row.name)}</span><span class="leaderboard-points">${row.points} pts</span>`;
    list.appendChild(el);
  });
}

async function loadModerationPanel() {
  if (!me.isAdmin) return;
  const panel = document.getElementById("moderationPanel");
  panel.hidden = false;

  const response = await fetch(`${API_BASE_URL}/community/reports`, { credentials: "include" });
  const data = await response.json();
  const list = document.getElementById("reportsList");
  list.innerHTML = "";

  if (!data.reports.length) {
    list.innerHTML = "<p>No open reports.</p>";
    return;
  }

  data.reports.forEach((report) => {
    const row = document.createElement("div");
    row.className = "report-row";
    row.innerHTML = `<strong>${escapeHtml(report.targetType)}</strong> reported: ${escapeHtml(report.reason)}`;
    const actions = document.createElement("div");
    actions.className = "report-actions";
    ["dismiss", "remove_content", "suspend_user", "ban_user"].forEach((action) => {
      if (action !== "dismiss" && report.targetType === "comment" && action !== "remove_content") return;
      if ((action === "suspend_user" || action === "ban_user") && report.targetType !== "user") return;
      const button = document.createElement("button");
      button.textContent = action.replace("_", " ");
      button.addEventListener("click", async () => {
        await fetch(`${API_BASE_URL}/community/reports/${report.id}/resolve`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        loadModerationPanel();
      });
      actions.appendChild(button);
    });
    row.appendChild(actions);
    list.appendChild(row);
  });
}

(async function init() {
  me = await requireLogin();
  if (!me) return;

  initPageChrome(me);
  setupCreatePost();
  setupSearch();
  loadFeed(1);
  loadLeaderboard();
  loadModerationPanel();
})();
