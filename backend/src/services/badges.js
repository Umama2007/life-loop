// Badge (achievement) definitions and the logic that checks whether a user
// has newly earned any of them. Criteria are based only on real, recorded
// activity (scans, logged actions, posts) — never anything a user could
// "game" in a way that encourages environmentally harmful choices (e.g.
// there's no badge for recycling more than repairing/reusing).

const { readCollection, writeCollection } = require("../db");
const { createNotification } = require("./notifications");

const BADGES = [
  {
    id: "first_scan",
    title: "First Scan",
    description: "Scanned your first item.",
    check: ({ items }) => items.length >= 1,
  },
  {
    id: "first_repair",
    title: "First Repair",
    description: "Recorded your first repaired item.",
    check: ({ items }) => items.some((i) => i.userAction === "repair"),
  },
  {
    id: "first_donation",
    title: "First Donation",
    description: "Recorded your first donated item.",
    check: ({ items }) => items.some((i) => i.userAction === "donate"),
  },
  {
    id: "reuse_starter",
    title: "Reuse Starter",
    description: "Found a new use for something instead of tossing it.",
    check: ({ items }) => items.some((i) => i.userAction === "reuse"),
  },
  {
    id: "second_life_builder",
    title: "Second-Life Builder",
    description: "Completed 5 actions that gave an item a second life (repair, reuse, resell, or donate).",
    check: ({ items }) =>
      items.filter((i) => ["repair", "reuse", "resell", "donate"].includes(i.userAction)).length >= 5,
  },
  {
    id: "sustainability_explorer",
    title: "Sustainability Explorer",
    description: "Scanned items across 4 or more different categories.",
    check: ({ items }) => new Set(items.map((i) => i.category)).size >= 4,
  },
  {
    id: "community_contributor",
    title: "Community Contributor",
    description: "Shared your first before/after post with the community.",
    check: ({ posts }) => posts.length >= 1,
  },
];

function getBadgeDefinitions() {
  return BADGES.map(({ id, title, description }) => ({ id, title, description }));
}

// Evaluates all badge criteria for a user against current data, awards any
// newly-earned badges (idempotent — never re-awards one already held), and
// returns the user's full unlocked-badge list afterward.
function checkAndAwardBadges(userId) {
  const items = readCollection("items").filter((i) => i.userId === userId);
  const posts = readCollection("posts").filter((p) => p.userId === userId);
  const userBadges = readCollection("userBadges");
  const alreadyUnlocked = new Set(userBadges.filter((b) => b.userId === userId).map((b) => b.badgeId));

  let changed = false;
  for (const badge of BADGES) {
    if (alreadyUnlocked.has(badge.id)) continue;
    if (badge.check({ items, posts })) {
      userBadges.push({ id: `${userId}:${badge.id}`, userId, badgeId: badge.id, unlockedAt: new Date().toISOString() });
      createNotification(userId, "badge", `Badge unlocked: ${badge.title}`, badge.description, "profile.html");
      changed = true;
    }
  }
  if (changed) writeCollection("userBadges", userBadges);

  return readCollection("userBadges").filter((b) => b.userId === userId);
}

function getUserBadges(userId) {
  return readCollection("userBadges").filter((b) => b.userId === userId);
}

module.exports = { getBadgeDefinitions, checkAndAwardBadges, getUserBadges, BADGE_POINTS: 50 };
