let me = null;
let profileUserId = null;

const BADGE_ICONS = {
  first_scan: () => Icons.search(),
  first_repair: () => Icons.wrench(),
  first_donation: () => Icons.gift(),
  reuse_starter: () => Icons.recycle(),
  second_life_builder: () => Icons.layers(),
  sustainability_explorer: () => Icons.globe(),
  community_contributor: () => Icons.messageCircle(),
};

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function loadProfile() {
  const response = await fetch(`${API_BASE}/community/users/${profileUserId}`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) return;

  const profile = data.profile;
  document.getElementById("profileAvatar").textContent = profile.name.charAt(0).toUpperCase();
  document.getElementById("profileName").textContent = profile.name;
  document.getElementById("profileStats").textContent =
    `${profile.totalScans} scans • ${profile.itemsCompleted} completed • ${profile.postCount} posts • ${profile.followerCount} followers • ${profile.followingCount} following`;
  document.getElementById("postsHeading").textContent = profile.isOwnProfile ? "Your posts" : `${profile.name}'s posts`;

  document.getElementById("profileBioDisplay").textContent = profile.bio || (profile.isOwnProfile ? "Add a short bio about yourself." : "No bio yet.");

  const followButton = document.getElementById("followButton");
  if (!profile.isOwnProfile) {
    followButton.hidden = false;
    followButton.innerHTML = profile.isFollowedByMe ? `${Icons.check()} Following` : "Follow";
    followButton.onclick = async () => {
      await fetch(`${API_BASE}/community/users/${profileUserId}/follow`, {
        method: profile.isFollowedByMe ? "DELETE" : "POST",
        credentials: "include",
      });
      loadProfile();
    };
  } else {
    followButton.hidden = true;
    document.getElementById("editBioButton").hidden = false;
  }

  renderBadges(profile.badges);

  if (profile.isOwnProfile) {
    document.getElementById("challengesSection").hidden = false;
    loadChallenges();
  }

  loadProfilePosts();
}

function renderBadges(unlockedBadges) {
  fetch(`${API_BASE}/community/badges`, { credentials: "include" })
    .then((r) => r.json())
    .then((data) => {
      const grid = document.getElementById("badgesGrid");
      grid.innerHTML = "";
      const unlockedIds = new Set(unlockedBadges.map((b) => b.badgeId));
      data.badges.forEach((badge) => {
        const card = document.createElement("div");
        card.className = `badge-card${unlockedIds.has(badge.id) ? "" : " locked"}`;
        card.innerHTML = `<div class="badge-icon">${(BADGE_ICONS[badge.id] || Icons.award)()}</div><strong>${badge.title}</strong><span>${badge.description}</span>`;
        grid.appendChild(card);
      });
    });
}

async function loadChallenges() {
  const response = await fetch(`${API_BASE}/community/challenges`, { credentials: "include" });
  const data = await response.json();
  const list = document.getElementById("challengesList");
  list.innerHTML = "";

  data.challenges.forEach((challenge) => {
    const card = document.createElement("div");
    card.className = `challenge-card${challenge.completed ? " completed" : ""}`;

    const percent = Math.round((challenge.progress / challenge.target) * 100);
    card.innerHTML = `
      <strong>${challenge.title}${challenge.completed ? ` <span class="inline-check">${Icons.check()}</span>` : ""}</strong>
      <p>${challenge.description}</p>
      <div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${percent}%"></div></div>
      <span>${challenge.progress}/${challenge.target}</span>
    `;

    if (!challenge.joined) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Join challenge";
      button.addEventListener("click", async () => {
        await fetch(`${API_BASE}/community/challenges/${challenge.id}/join`, { method: "POST", credentials: "include" });
        loadChallenges();
        window.refreshNotifications?.();
      });
      card.appendChild(button);
    }

    list.appendChild(card);
  });
}

async function loadProfilePosts() {
  const response = await fetch(`${API_BASE}/community/posts?userId=${profileUserId}&pageSize=20`, { credentials: "include" });
  const data = await response.json();
  const container = document.getElementById("profilePosts");
  const empty = document.getElementById("profilePostsEmpty");
  container.innerHTML = "";

  if (!data.posts.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  data.posts.forEach((post) => {
    const card = renderPostCard(post, me.id, {
      onLike: async (p, like) => {
        await fetch(`${API_BASE}/community/posts/${p.id}/like`, { method: like ? "POST" : "DELETE", credentials: "include" });
        loadProfilePosts();
      },
      onToggleComments: async (p, section) => {
        if (!section.hidden) { section.hidden = true; return; }
        section.hidden = false;
        const r = await fetch(`${API_BASE}/community/posts/${p.id}`, { credentials: "include" });
        const d = await r.json();
        renderComments(section, d.comments, me.id, {
          onAddComment: async (text) => {
            await fetch(`${API_BASE}/community/posts/${p.id}/comments`, {
              method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
            });
            loadProfilePosts();
          },
          onDeleteComment: async (comment) => {
            await fetch(`${API_BASE}/community/comments/${comment.id}`, { method: "DELETE", credentials: "include" });
            loadProfilePosts();
          },
        });
      },
      onEdit: async (p) => {
        const next = window.prompt("Edit your post:", p.description);
        if (next === null) return;
        await fetch(`${API_BASE}/community/posts/${p.id}`, {
          method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: next }),
        });
        loadProfilePosts();
      },
      onDelete: async (p) => {
        if (!window.confirm("Delete this post?")) return;
        await fetch(`${API_BASE}/community/posts/${p.id}`, { method: "DELETE", credentials: "include" });
        loadProfilePosts();
      },
      onReport: async (p) => {
        const reason = window.prompt("Why are you reporting this post?");
        if (!reason) return;
        await fetch(`${API_BASE}/community/report`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType: "post", targetId: p.id, reason }),
        });
        window.alert("Thanks — this post has been reported to our moderators.");
      },
    });
    container.appendChild(card);
  });
}

function setupBioEditing() {
  document.getElementById("editBioButton").addEventListener("click", () => {
    document.getElementById("profileBioInput").value = document.getElementById("profileBioDisplay").textContent;
    document.getElementById("profileBioEdit").hidden = false;
  });
  document.getElementById("saveBioButton").addEventListener("click", async () => {
    const bio = document.getElementById("profileBioInput").value;
    await fetch(`${API_BASE}/community/profile`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio }),
    });
    document.getElementById("profileBioEdit").hidden = true;
    loadProfile();
  });
}

(async function init() {
  me = await requireLogin();
  if (!me) return;

  initPageChrome(me);
  profileUserId = getQueryParam("id") || "me";
  setupBioEditing();
  loadProfile();
})();
