// Sustainability challenge definitions. Progress is always computed fresh
// from the user's actual scan/action history (never a separately-tracked
// counter that could drift out of sync), counting only activity that
// happened after the user joined the challenge.

const { readCollection, writeCollection } = require("../db");
const { createNotification } = require("./notifications");

const CHALLENGES = [
  { id: "give_5_second_life", title: "Give 5 items a second life", description: "Repair, reuse, resell, or donate 5 items.", target: 5, metric: "secondLifeActions" },
  { id: "repair_3", title: "Repair 3 items", description: "Record 3 items you've repaired.", target: 3, metric: "repairedItems" },
  { id: "reuse_3", title: "Reuse 3 items", description: "Find a new use for 3 items instead of discarding them.", target: 3, metric: "reusedItems" },
  { id: "donate_5", title: "Donate 5 items", description: "Give 5 items to someone who can still use them.", target: 5, metric: "donatedItems" },
  { id: "complete_10_scans", title: "Complete 10 scans", description: "Scan 10 items with LifeLoop.", target: 10, metric: "totalScans" },
];

function getChallengeDefinitions() {
  return CHALLENGES.map(({ id, title, description, target }) => ({ id, title, description, target }));
}

function countForMetric(metric, items) {
  switch (metric) {
    case "secondLifeActions":
      return items.filter((i) => ["repair", "reuse", "resell", "donate"].includes(i.userAction)).length;
    case "repairedItems":
      return items.filter((i) => i.userAction === "repair").length;
    case "reusedItems":
      return items.filter((i) => i.userAction === "reuse").length;
    case "donatedItems":
      return items.filter((i) => i.userAction === "donate").length;
    case "totalScans":
      return items.length;
    default:
      return 0;
  }
}

// Returns every challenge with the current user's join/progress/completion
// status layered on top.
async function getChallengesForUser(userId) {
  const items = (await readCollection("items")).filter((i) => i.userId === userId);
  const userChallenges = (await readCollection("userChallenges")).filter((c) => c.userId === userId);
  let changed = false;

  const result = [];
  for (const def of CHALLENGES) {
    const joined = userChallenges.find((c) => c.challengeId === def.id);
    if (!joined) {
      result.push({ ...def, joined: false, progress: 0, completed: false, joinedAt: null, completedAt: null });
      continue;
    }

    const relevantItems = items.filter((i) => i.userActionAt && new Date(i.userActionAt) >= new Date(joined.joinedAt));
    const scansAfterJoin = items.filter((i) => new Date(i.createdAt) >= new Date(joined.joinedAt));
    const progress = def.metric === "totalScans" ? countForMetric(def.metric, scansAfterJoin) : countForMetric(def.metric, relevantItems);
    const completed = progress >= def.target;

    if (completed && !joined.completedAt) {
      joined.completedAt = new Date().toISOString();
      await createNotification(userId, "challenge", `Challenge completed: ${def.title}`, def.description, "profile.html");
      changed = true;
    }

    result.push({ ...def, joined: true, progress: Math.min(progress, def.target), completed, joinedAt: joined.joinedAt, completedAt: joined.completedAt });
  }

  if (changed) {
    const all = await readCollection("userChallenges");
    await writeCollection("userChallenges", all.map((c) => userChallenges.find((u) => u.id === c.id) || c));
  }

  return result;
}

async function joinChallenge(userId, challengeId) {
  if (!CHALLENGES.some((c) => c.id === challengeId)) return null;
  const userChallenges = await readCollection("userChallenges");
  if (userChallenges.some((c) => c.userId === userId && c.challengeId === challengeId)) {
    return (await getChallengesForUser(userId)).find((c) => c.id === challengeId);
  }
  userChallenges.push({ id: `${userId}:${challengeId}`, userId, challengeId, joinedAt: new Date().toISOString(), completedAt: null });
  await writeCollection("userChallenges", userChallenges);
  return (await getChallengesForUser(userId)).find((c) => c.id === challengeId);
}

module.exports = { getChallengeDefinitions, getChallengesForUser, joinChallenge, CHALLENGE_POINTS: 100 };
