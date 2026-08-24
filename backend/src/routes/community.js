const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { sendError } = require("../utils/errors");
const { isNonEmptyString, isOneOf, clampPagination } = require("../utils/validate");
const { imageFileFilter, verifyUploadedImages } = require("../utils/imageUpload");
const badges = require("../services/badges");
const challenges = require("../services/challenges");
const { createNotification } = require("../services/notifications");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname || "").slice(0, 8)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

const REPORT_TARGET_TYPES = ["post", "comment", "user"];
const RESOLUTION_ACTIONS = ["dismiss", "remove_content", "suspend_user", "ban_user"];

function publicProfile(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, bio: user.bio || "", isAdmin: Boolean(user.isAdmin) };
}

function deleteUploadedFile(url) {
  if (!url) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

// Accepts pre-loaded collections rather than reading likes/comments/users
// from disk itself, so callers that decorate many posts at once (e.g. the
// feed list) read each collection exactly once instead of once per post.
function decoratePost(post, currentUserId, collections) {
  const allLikes = collections?.likes || readCollection("likes");
  const allComments = collections?.comments || readCollection("comments");
  const allUsers = collections?.users || readCollection("users");

  const likes = allLikes.filter((l) => l.postId === post.id);
  const commentCount = allComments.filter((c) => c.postId === post.id).length;
  const author = allUsers.find((u) => u.id === post.userId);
  return {
    ...post,
    author: publicProfile(author),
    likeCount: likes.length,
    commentCount,
    likedByMe: likes.some((l) => l.userId === currentUserId),
  };
}

// ---- Posts ------------------------------------------------------------

router.post(
  "/posts",
  requireAuth,
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: "You're posting faster than we can keep up. Please slow down." }),
  upload.fields([{ name: "beforeImage", maxCount: 1 }, { name: "afterImage", maxCount: 1 }]),
  verifyUploadedImages,
  (req, res) => {
    const { description } = req.body || {};
    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile = req.files?.afterImage?.[0];

    if (!isNonEmptyString(description) && !beforeFile && !afterFile) {
      return sendError(res, 400, "EMPTY_POST", "Add a description or at least one photo.");
    }

    const posts = readCollection("posts");
    const post = {
      id: uuidv4(),
      userId: req.userId,
      description: (description || "").trim().slice(0, 2000),
      beforeImageUrl: beforeFile ? `/uploads/${beforeFile.filename}` : null,
      afterImageUrl: afterFile ? `/uploads/${afterFile.filename}` : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    posts.push(post);
    writeCollection("posts", posts);
    badges.checkAndAwardBadges(req.userId);

    res.status(201).json({ post: decoratePost(post, req.userId) });
  }
);

router.get("/posts", requireAuth, (req, res) => {
  const { search } = req.query;
  const userId = req.query.userId === "me" ? req.userId : req.query.userId;
  const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize);

  let posts = readCollection("posts");
  if (userId) posts = posts.filter((p) => p.userId === userId);
  if (isNonEmptyString(search)) {
    const needle = search.trim().toLowerCase();
    const users = readCollection("users");
    posts = posts.filter((p) => {
      const author = users.find((u) => u.id === p.userId);
      return p.description.toLowerCase().includes(needle) || author?.name.toLowerCase().includes(needle);
    });
  }
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = posts.slice((page - 1) * pageSize, page * pageSize);

  const collections = { likes: readCollection("likes"), comments: readCollection("comments"), users: readCollection("users") };
  res.json({ posts: pageItems.map((p) => decoratePost(p, req.userId, collections)), page, pageSize, total, totalPages });
});

router.get("/posts/:id", requireAuth, (req, res) => {
  const post = readCollection("posts").find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const comments = readCollection("comments")
    .filter((c) => c.postId === post.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((c) => ({ ...c, author: publicProfile(readCollection("users").find((u) => u.id === c.userId)) }));

  res.json({ post: decoratePost(post, req.userId), comments });
});

router.patch("/posts/:id", requireAuth, (req, res) => {
  const posts = readCollection("posts");
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");
  if (post.userId !== req.userId) return sendError(res, 403, "NOT_YOUR_POST", "You can only edit your own posts.");

  if (isNonEmptyString(req.body?.description)) {
    post.description = req.body.description.trim().slice(0, 2000);
    post.updatedAt = new Date().toISOString();
  }
  writeCollection("posts", posts);
  res.json({ post: decoratePost(post, req.userId) });
});

router.delete("/posts/:id", requireAuth, (req, res) => {
  const posts = readCollection("posts");
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const requester = readCollection("users").find((u) => u.id === req.userId);
  if (post.userId !== req.userId && !requester?.isAdmin) {
    return sendError(res, 403, "NOT_YOUR_POST", "You can only delete your own posts.");
  }

  deleteUploadedFile(post.beforeImageUrl);
  deleteUploadedFile(post.afterImageUrl);
  writeCollection("posts", posts.filter((p) => p.id !== req.params.id));
  writeCollection("comments", readCollection("comments").filter((c) => c.postId !== req.params.id));
  writeCollection("likes", readCollection("likes").filter((l) => l.postId !== req.params.id));

  res.json({ success: true });
});

router.post("/posts/:id/like", requireAuth, (req, res) => {
  const post = readCollection("posts").find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const likes = readCollection("likes");
  if (!likes.some((l) => l.postId === req.params.id && l.userId === req.userId)) {
    likes.push({ id: uuidv4(), postId: req.params.id, userId: req.userId, createdAt: new Date().toISOString() });
    writeCollection("likes", likes);

    if (post.userId !== req.userId) {
      const liker = readCollection("users").find((u) => u.id === req.userId);
      createNotification(post.userId, "like", "New like", `${liker?.name || "Someone"} liked your post.`, `community.html?post=${post.id}`);
    }
  }
  res.json({ post: decoratePost(post, req.userId) });
});

router.delete("/posts/:id/like", requireAuth, (req, res) => {
  const post = readCollection("posts").find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  writeCollection("likes", readCollection("likes").filter((l) => !(l.postId === req.params.id && l.userId === req.userId)));
  res.json({ post: decoratePost(post, req.userId) });
});

// ---- Comments ---------------------------------------------------------

router.post("/posts/:id/comments", requireAuth, (req, res) => {
  const post = readCollection("posts").find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");
  if (!isNonEmptyString(req.body?.text)) return sendError(res, 400, "EMPTY_COMMENT", "Comment can't be empty.");

  const comments = readCollection("comments");
  const comment = {
    id: uuidv4(),
    postId: req.params.id,
    userId: req.userId,
    text: req.body.text.trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  writeCollection("comments", comments);

  if (post.userId !== req.userId) {
    const commenter = readCollection("users").find((u) => u.id === req.userId);
    createNotification(
      post.userId,
      "comment",
      "New comment",
      `${commenter?.name || "Someone"} commented: "${comment.text.slice(0, 60)}${comment.text.length > 60 ? "..." : ""}"`,
      `community.html?post=${post.id}`
    );
  }

  res.status(201).json({ comment: { ...comment, author: publicProfile(readCollection("users").find((u) => u.id === req.userId)) } });
});

router.delete("/comments/:id", requireAuth, (req, res) => {
  const comments = readCollection("comments");
  const comment = comments.find((c) => c.id === req.params.id);
  if (!comment) return sendError(res, 404, "COMMENT_NOT_FOUND", "That comment couldn't be found.");

  const requester = readCollection("users").find((u) => u.id === req.userId);
  if (comment.userId !== req.userId && !requester?.isAdmin) {
    return sendError(res, 403, "NOT_YOUR_COMMENT", "You can only delete your own comments.");
  }

  writeCollection("comments", comments.filter((c) => c.id !== req.params.id));
  res.json({ success: true });
});

// ---- Follows & profiles -------------------------------------------------

router.post("/users/:id/follow", requireAuth, (req, res) => {
  if (req.params.id === req.userId) return sendError(res, 400, "CANNOT_FOLLOW_SELF", "You can't follow yourself.");
  const targetExists = readCollection("users").some((u) => u.id === req.params.id);
  if (!targetExists) return sendError(res, 404, "USER_NOT_FOUND", "That user couldn't be found.");

  const follows = readCollection("follows");
  if (!follows.some((f) => f.followerId === req.userId && f.followingId === req.params.id)) {
    follows.push({ id: uuidv4(), followerId: req.userId, followingId: req.params.id, createdAt: new Date().toISOString() });
    writeCollection("follows", follows);

    const follower = readCollection("users").find((u) => u.id === req.userId);
    createNotification(req.params.id, "follow", "New follower", `${follower?.name || "Someone"} started following you.`, `profile.html?id=${req.userId}`);
  }
  res.json({ success: true });
});

router.delete("/users/:id/follow", requireAuth, (req, res) => {
  writeCollection("follows", readCollection("follows").filter((f) => !(f.followerId === req.userId && f.followingId === req.params.id)));
  res.json({ success: true });
});

router.get("/users/:id", requireAuth, (req, res) => {
  const targetId = req.params.id === "me" ? req.userId : req.params.id;
  const user = readCollection("users").find((u) => u.id === targetId);
  if (!user) return sendError(res, 404, "USER_NOT_FOUND", "That user couldn't be found.");

  const items = readCollection("items").filter((i) => i.userId === targetId);
  const posts = readCollection("posts").filter((p) => p.userId === targetId);
  const follows = readCollection("follows");
  const unlockedBadges = badges.getUserBadges(targetId);

  res.json({
    profile: {
      ...publicProfile(user),
      totalScans: items.length,
      itemsCompleted: items.filter((i) => i.userAction).length,
      postCount: posts.length,
      followerCount: follows.filter((f) => f.followingId === targetId).length,
      followingCount: follows.filter((f) => f.followerId === targetId).length,
      isFollowedByMe: follows.some((f) => f.followerId === req.userId && f.followingId === targetId),
      isOwnProfile: targetId === req.userId,
      badges: unlockedBadges.map((b) => ({ badgeId: b.badgeId, unlockedAt: b.unlockedAt })),
    },
  });
});

router.patch("/profile", requireAuth, (req, res) => {
  const users = readCollection("users");
  const user = users.find((u) => u.id === req.userId);
  if (typeof req.body?.bio === "string") user.bio = req.body.bio.slice(0, 500);
  writeCollection("users", users);
  res.json({ profile: publicProfile(user) });
});

// ---- Search -------------------------------------------------------------

router.get("/search", requireAuth, (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) return res.json({ users: [], posts: [] });

  const users = readCollection("users")
    .filter((u) => u.name.toLowerCase().includes(query))
    .slice(0, 20)
    .map(publicProfile);

  const collections = { likes: readCollection("likes"), comments: readCollection("comments"), users: readCollection("users") };
  const posts = readCollection("posts")
    .filter((p) => p.description.toLowerCase().includes(query))
    .slice(0, 20)
    .map((p) => decoratePost(p, req.userId, collections));

  res.json({ users, posts });
});

// ---- Badges & challenges --------------------------------------------------

router.get("/badges", requireAuth, (req, res) => {
  const unlocked = badges.checkAndAwardBadges(req.userId);
  const unlockedIds = new Map(unlocked.map((b) => [b.badgeId, b.unlockedAt]));
  const list = badges.getBadgeDefinitions().map((def) => ({
    ...def,
    unlocked: unlockedIds.has(def.id),
    unlockedAt: unlockedIds.get(def.id) || null,
  }));
  res.json({ badges: list });
});

router.get("/challenges", requireAuth, (req, res) => {
  res.json({ challenges: challenges.getChallengesForUser(req.userId) });
});

router.post("/challenges/:id/join", requireAuth, (req, res) => {
  const result = challenges.joinChallenge(req.userId, req.params.id);
  if (!result) return sendError(res, 404, "CHALLENGE_NOT_FOUND", "That challenge doesn't exist.");
  res.json({ challenge: result });
});

// ---- Leaderboard ----------------------------------------------------------

router.get("/leaderboard", requireAuth, (req, res) => {
  const users = readCollection("users");
  const items = readCollection("items");
  const allUserChallenges = readCollection("userChallenges").filter((c) => c.completedAt);
  const allBadges = readCollection("userBadges");

  const rows = users.map((user) => {
    const userItems = items.filter((i) => i.userId === user.id);
    const completedActions = userItems.filter((i) => i.userAction).length;
    const challengesCompleted = allUserChallenges.filter((c) => c.userId === user.id).length;
    const badgeCount = allBadges.filter((b) => b.userId === user.id).length;
    const points = completedActions * 5 + badgeCount * badges.BADGE_POINTS + challengesCompleted * challenges.CHALLENGE_POINTS;
    return { userId: user.id, name: user.name, completedActions, challengesCompleted, badgeCount, points };
  });

  rows.sort((a, b) => b.points - a.points);
  const ranked = rows.slice(0, 50).map((row, index) => ({ rank: index + 1, ...row }));

  res.json({ leaderboard: ranked });
});

// ---- Reports & moderation ---------------------------------------------

router.post("/report", requireAuth, (req, res) => {
  const { targetType, targetId, reason } = req.body || {};
  if (!isOneOf(targetType, REPORT_TARGET_TYPES)) return sendError(res, 400, "INVALID_TARGET_TYPE", "Unrecognized report target.");
  if (!isNonEmptyString(targetId)) return sendError(res, 400, "INVALID_TARGET", "Missing target to report.");
  if (!isNonEmptyString(reason)) return sendError(res, 400, "MISSING_REASON", "Please describe why you're reporting this.");

  const reports = readCollection("reports");
  const report = {
    id: uuidv4(),
    targetType,
    targetId,
    reporterId: req.userId,
    reason: reason.trim().slice(0, 1000),
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
  };
  reports.push(report);
  writeCollection("reports", reports);
  res.status(201).json({ report });
});

router.get("/reports", requireAuth, requireAdmin, (req, res) => {
  const status = req.query.status || "open";
  let reports = readCollection("reports");
  if (status !== "all") reports = reports.filter((r) => r.status === status);
  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports });
});

router.post("/reports/:id/resolve", requireAuth, requireAdmin, (req, res) => {
  const { action } = req.body || {};
  if (!isOneOf(action, RESOLUTION_ACTIONS)) return sendError(res, 400, "INVALID_ACTION", "Unrecognized moderation action.");

  const reports = readCollection("reports");
  const report = reports.find((r) => r.id === req.params.id);
  if (!report) return sendError(res, 404, "REPORT_NOT_FOUND", "That report couldn't be found.");

  if (action === "remove_content") {
    if (report.targetType === "post") {
      const posts = readCollection("posts");
      const post = posts.find((p) => p.id === report.targetId);
      if (post) {
        deleteUploadedFile(post.beforeImageUrl);
        deleteUploadedFile(post.afterImageUrl);
        writeCollection("posts", posts.filter((p) => p.id !== report.targetId));
        writeCollection("comments", readCollection("comments").filter((c) => c.postId !== report.targetId));
        writeCollection("likes", readCollection("likes").filter((l) => l.postId !== report.targetId));
      }
    } else if (report.targetType === "comment") {
      writeCollection("comments", readCollection("comments").filter((c) => c.id !== report.targetId));
    }
  } else if (action === "suspend_user" || action === "ban_user") {
    const userIdToModerate = report.targetType === "user" ? report.targetId : null;
    if (userIdToModerate) {
      const users = readCollection("users");
      const target = users.find((u) => u.id === userIdToModerate);
      if (target) {
        if (action === "suspend_user") target.suspended = true;
        if (action === "ban_user") target.banned = true;
        writeCollection("users", users);
      }
    }
  }

  report.status = "resolved";
  report.resolvedAt = new Date().toISOString();
  report.resolvedBy = req.userId;
  report.resolution = action;
  writeCollection("reports", reports);

  res.json({ report });
});

// Multer errors (file too large, bad type) land here.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return sendError(res, 400, "UPLOAD_ERROR", err.message || "Could not process the uploaded file(s).");
  }
  next();
});

module.exports = router;
