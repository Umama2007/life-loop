// Tiny file-based JSON datastore.
//
// LifeLoop is meant to run entirely on one person's machine with a single
// double-click start script, so we intentionally avoid database engines that
// need native compilation or a separate service to install. Everything is
// stored as plain JSON files under backend/data/, which works identically on
// Windows, macOS and Linux with zero extra setup.
//
// Performance note: every read used to hit disk and re-parse the whole file,
// every time — for a request that touches the same collection multiple
// times (e.g. decorating several posts with author/like/comment data), that
// meant repeated disk I/O and JSON parsing for data that hadn't changed.
// An in-memory cache, invalidated on every write, removes that entirely:
// reads after the first one are just an array copy, not a disk round-trip.
// This is safe for LifeLoop's single-process, single-machine deployment
// model — it assumes one Node process owns the data files, which is exactly
// how start.sh/start.bat run it. If this app were ever run as multiple
// processes sharing the same data folder, this cache would need revisiting.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILES = {
  users: path.join(DATA_DIR, "users.json"),
  items: path.join(DATA_DIR, "items.json"),
  posts: path.join(DATA_DIR, "posts.json"),
  comments: path.join(DATA_DIR, "comments.json"),
  likes: path.join(DATA_DIR, "likes.json"),
  follows: path.join(DATA_DIR, "follows.json"),
  reports: path.join(DATA_DIR, "reports.json"),
  userBadges: path.join(DATA_DIR, "userBadges.json"),
  userChallenges: path.join(DATA_DIR, "userChallenges.json"),
  notifications: path.join(DATA_DIR, "notifications.json"),
  jobs: path.join(DATA_DIR, "jobs.json"),
};

const cache = new Map();

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const filePath of Object.values(FILES)) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
  }
}

function readCollection(name) {
  const cached = cache.get(name);
  if (cached) return [...cached];

  ensureDataFiles();
  const raw = fs.readFileSync(FILES[name], "utf8");
  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    records = [];
  }
  cache.set(name, records);
  return [...records];
}

function writeCollection(name, records) {
  ensureDataFiles();
  // Write to a temp file then rename, so a crash mid-write can't corrupt data.
  const tempPath = `${FILES[name]}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(tempPath, FILES[name]);
  cache.set(name, records);
}

module.exports = { ensureDataFiles, readCollection, writeCollection };
