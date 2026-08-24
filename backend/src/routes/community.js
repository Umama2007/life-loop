const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection, getCollection } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { sendError } = require("../utils/errors");
const { isNonEmptyString, isOneOf, clampPagination } = require("../utils/validate");
const { imageFileFilter, verifyUploadedImages } = require("../utils/imageUpload");
const badges = require("../services/badges");
const challenges = require("../services/challenges");
const { createNotification } = require("../services/notifications");
const { uploadBufferToCloudinary } = require("../utils/cloudinary");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
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
  // Images are on Cloudinary, we don't delete them locally anymore
}

// Accepts pre-loaded collections rather than reading likes/comments/users
// from disk itself, so callers that decorate many posts at once (e.g. the
// feed list) read each collection exactly once instead of once per post.
async function decoratePost(post, currentUserId, collections) {
  const allLikes = collections?.likes || await readCollection("likes");
  const allComments = collections?.comments || await readCollection("comments");
  const allUsers = collections?.users || await readCollection("users");

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
  async (req, res) => {
    const { description } = req.body || {};
    const beforeFile = req.files?.beforeImage?.[0];
    const afterFile = req.files?.afterImage?.[0];

    if (!isNonEmptyString(description) && !beforeFile && !afterFile) {
      return sendError(res, 400, "EMPTY_POST", "Add a description or at least one photo.");
    }

    let beforeImageUrl = null;
    let afterImageUrl = null;
    if (beforeFile) {
      beforeImageUrl = await uploadBufferToCloudinary(beforeFile.buffer, "posts");
    }
    if (afterFile) {
      afterImageUrl = await uploadBufferToCloudinary(afterFile.buffer, "posts");
    }

    const post = {
      id: uuidv4(),
      userId: req.userId,
      description: (description || "").trim().slice(0, 2000),
      beforeImageUrl,
      afterImageUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await (await getCollection("posts")).insertOne(post);
    await badges.checkAndAwardBadges(req.userId);

    res.status(201).json({ post: await decoratePost(post, req.userId) });
  }
);

router.get ("/posts", requireAuth, async (req, res) => {
  const { search } = req.query;
  const userId = req.query.userId === "me" ? req.userId : req.query.userId;
  const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize);

  let posts = await readCollection("posts");
  if (userId) posts = posts.filter((p) => p.userId === userId);
  if (isNonEmptyString(search)) {
    const needle = search.trim().toLowerCase();
    const users = await readCollection("users");
    posts = posts.filter((p) => {
      const author = users.find((u) => u.id === p.userId);
      return p.description.toLowerCase().includes(needle) || author?.name.toLowerCase().includes(needle);
    });
  }
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = posts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = posts.slice((page - 1) * pageSize, page * pageSize);

  const collections = { likes: await readCollection("likes"), comments: await readCollection("comments"), users: await readCollection("users") };
  const decorated = await Promise.all(pageItems.map((p) => decoratePost(p, req.userId, collections)));
  res.json({ posts: decorated, page, pageSize, total, totalPages });
});

router.get ("/posts/:id", requireAuth, async (req, res) => {
  const post = (await readCollection("posts")).find((p) => p.id === req.params.id);
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const allUsers = await readCollection("users");
  const allComments = await readCollection("comments");
  const comments = allComments
    .filter((c) => c.postId === post.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((c) => ({ ...c, author: publicProfile(allUsers.find((u) => u.id === c.userId)) }));

  res.json({ post: await decoratePost(post, req.userId), comments });
});

router.patch ("/posts/:id", requireAuth, async (req, res) => {
  const postsCol = await getCollection("posts");
  const post = await postsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");
  if (post.userId !== req.userId) return sendError(res, 403, "NOT_YOUR_POST", "You can only edit your own posts.");

  if (isNonEmptyString(req.body?.description)) {
    const description = req.body.description.trim().slice(0, 2000);
    const updatedAt = new Date().toISOString();
    await postsCol.updateOne({ id: req.params.id }, { $set: { description, updatedAt } });
  }
  res.json({ post: await decoratePost(post, req.userId) });
});

router.delete ("/posts/:id", requireAuth, async (req, res) => {
  const postsCol = await getCollection("posts");
  const post = await postsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const requester = await (await getCollection("users")).findOne({ id: req.userId }, { projection: { _id: 0 } });
  if (post.userId !== req.userId && !requester?.isAdmin) {
    return sendError(res, 403, "NOT_YOUR_POST", "You can only delete your own posts.");
  }

  deleteUploadedFile(post.beforeImageUrl);
  deleteUploadedFile(post.afterImageUrl);
  await postsCol.deleteOne({ id: req.params.id });
  await (await getCollection("comments")).deleteMany({ postId: req.params.id });
  await (await getCollection("likes")).deleteMany({ postId: req.params.id });

  res.json({ success: true });
});

router.post ("/posts/:id/like", requireAuth, async (req, res) => {
  const postsCol = await getCollection("posts");
  const post = await postsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const likesCol = await getCollection("likes");
  const existingLike = await likesCol.findOne({ postId: req.params.id, userId: req.userId });
  if (!existingLike) {
    await likesCol.insertOne({ id: uuidv4(), postId: req.params.id, userId: req.userId, createdAt: new Date().toISOString() });

    if (post.userId !== req.userId) {
      const liker = await (await getCollection("users")).findOne({ id: req.userId }, { projection: { _id: 0 } });
      await createNotification(post.userId, "like", "New like", `${liker?.name || "Someone"} liked your post.`, `community.html?post=${post.id}`);
    }
  }
  res.json({ post: await decoratePost(post, req.userId) });
});

router.delete ("/posts/:id/like", requireAuth, async (req, res) => {
  const postsCol = await getCollection("posts");
  const post = await postsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");

  const likesCol = await getCollection("likes");
  await likesCol.deleteOne({ postId: req.params.id, userId: req.userId });
  res.json({ post: await decoratePost(post, req.userId) });
});

// ---- Comments ---------------------------------------------------------

router.post ("/posts/:id/comments", requireAuth, async (req, res) => {
  const postsCol = await getCollection("posts");
  const post = await postsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!post) return sendError(res, 404, "POST_NOT_FOUND", "That post couldn't be found.");
  if (!isNonEmptyString(req.body?.text)) return sendError(res, 400, "EMPTY_COMMENT", "Comment can't be empty.");

  const comment = {
    id: uuidv4(),
    postId: req.params.id,
    userId: req.userId,
    text: req.body.text.trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };
  await (await getCollection("comments")).insertOne(comment);

  if (post.userId !== req.userId) {
    const commenter = await (await getCollection("users")).findOne({ id: req.userId }, { projection: { _id: 0 } });
    await createNotification(
      post.userId,
      "comment",
      "New comment",
      `${commenter?.name || "Someone"} commented: "${comment.text.slice(0, 60)}${comment.text.length > 60 ? "..." : ""}"`,
      `community.html?post=${post.id}`
    );
  }

  const commenterUser = await (await getCollection("users")).findOne({ id: req.userId }, { projection: { _id: 0 } });
  res.status(201).json({ comment: { ...comment, author: publicProfile(commenterUser) } });
});

router.delete ("/comments/:id", requireAuth, async (req, res) => {
  const commentsCol = await getCollection("comments");
  const comment = await commentsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!comment) return sendError(res, 404, "COMMENT_NOT_FOUND", "That comment couldn't be found.");

  const requester = await (await getCollection("users")).findOne({ id: req.userId }, { projection: { _id: 0 } });
  if (comment.userId !== req.userId && !requester?.isAdmin) {
    return sendError(res, 403, "NOT_YOUR_COMMENT", "You can only delete your own comments.");
  }

  await commentsCol.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

// ---- Follows & profiles -------------------------------------------------

router.post ("/users/:id/follow", requireAuth, async (req, res) => {
  if (req.params.id === req.userId) return sendError(res, 400, "CANNOT_FOLLOW_SELF", "You can't follow yourself.");
  const usersCol = await getCollection("users");
  const targetExists = await usersCol.findOne({ id: req.params.id });
  if (!targetExists) return sendError(res, 404, "USER_NOT_FOUND", "That user couldn't be found.");

  const followsCol = await getCollection("follows");
  const existingFollow = await followsCol.findOne({ followerId: req.userId, followingId: req.params.id });
  if (!existingFollow) {
    await followsCol.insertOne({ id: uuidv4(), followerId: req.userId, followingId: req.params.id, createdAt: new Date().toISOString() });

    const follower = await usersCol.findOne({ id: req.userId }, { projection: { _id: 0 } });
    await createNotification(req.params.id, "follow", "New follower", `${follower?.name || "Someone"} started following you.`, `profile.html?id=${req.userId}`);
  }
  res.json({ success: true });
});

router.delete ("/users/:id/follow", requireAuth, async (req, res) => {
  const followsCol = await getCollection("follows");
  await followsCol.deleteOne({ followerId: req.userId, followingId: req.params.id });
  res.json({ success: true });
});

router.get ("/users/:id", requireAuth, async (req, res) => {
  const targetId = req.params.id === "me" ? req.userId : req.params.id;
  const user = (await readCollection("users")).find((u) => u.id === targetId);
  if (!user) return sendError(res, 404, "USER_NOT_FOUND", "That user couldn't be found.");

  const items = (await readCollection("items")).filter((i) => i.userId === targetId);
  const posts = (await readCollection("posts")).filter((p) => p.userId === targetId);
  const follows = await readCollection("follows");
  const unlockedBadges = await badges.getUserBadges(targetId);

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

router.patch ("/profile", requireAuth, async (req, res) => {
  const users = await readCollection("users");
  const user = users.find((u) => u.id === req.userId);
  if (typeof req.body?.bio === "string") user.bio = req.body.bio.slice(0, 500);
  await writeCollection("users", users);
  res.json({ profile: publicProfile(user) });
});

// ---- Search -------------------------------------------------------------

router.get ("/search", requireAuth, async (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();
  if (!query) return res.json({ users: [], posts: [] });

  const users = (await readCollection("users"))
    .filter((u) => u.name.toLowerCase().includes(query))
    .slice(0, 20)
    .map(publicProfile);

  const collections = { likes: await readCollection("likes"), comments: await readCollection("comments"), users: await readCollection("users") };
  const matchedPosts = (await readCollection("posts"))
    .filter((p) => p.description.toLowerCase().includes(query))
    .slice(0, 20);
  const posts = await Promise.all(matchedPosts.map((p) => decoratePost(p, req.userId, collections)));

  res.json({ users, posts });
});

// ---- Badges & challenges --------------------------------------------------

router.get ("/badges", requireAuth, async (req, res) => {
  const unlocked = await badges.checkAndAwardBadges(req.userId);
  const unlockedIds = new Map(unlocked.map((b) => [b.badgeId, b.unlockedAt]));
  const list = badges.getBadgeDefinitions().map((def) => ({
    ...def,
    unlocked: unlockedIds.has(def.id),
    unlockedAt: unlockedIds.get(def.id) || null,
  }));
  res.json({ badges: list });
});

router.get ("/challenges", requireAuth, async (req, res) => {
  res.json({ challenges: await challenges.getChallengesForUser(req.userId) });
});

router.post ("/challenges/:id/join", requireAuth, async (req, res) => {
  const result = await challenges.joinChallenge(req.userId, req.params.id);
  if (!result) return sendError(res, 404, "CHALLENGE_NOT_FOUND", "That challenge doesn't exist.");
  res.json({ challenge: result });
});

// ---- Leaderboard ----------------------------------------------------------

router.get ("/leaderboard", requireAuth, async (req, res) => {
  const users = await readCollection("users");
  const items = await readCollection("items");
  const allUserChallenges = (await readCollection("userChallenges")).filter((c) => c.completedAt);
  const allBadges = await readCollection("userBadges");

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

router.post ("/report", requireAuth, async (req, res) => {
  const { targetType, targetId, reason } = req.body || {};
  if (!isOneOf(targetType, REPORT_TARGET_TYPES)) return sendError(res, 400, "INVALID_TARGET_TYPE", "Unrecognized report target.");
  if (!isNonEmptyString(targetId)) return sendError(res, 400, "INVALID_TARGET", "Missing target to report.");
  if (!isNonEmptyString(reason)) return sendError(res, 400, "MISSING_REASON", "Please describe why you're reporting this.");

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
  await (await getCollection("reports")).insertOne(report);
  res.status(201).json({ report });
});

router.get ("/reports", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || "open";
  let reports = await readCollection("reports");
  if (status !== "all") reports = reports.filter((r) => r.status === status);
  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports });
});

router.post ("/reports/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
  const { action } = req.body || {};
  if (!isOneOf(action, RESOLUTION_ACTIONS)) return sendError(res, 400, "INVALID_ACTION", "Unrecognized moderation action.");

  const reportsCol = await getCollection("reports");
  const report = await reportsCol.findOne({ id: req.params.id }, { projection: { _id: 0 } });
  if (!report) return sendError(res, 404, "REPORT_NOT_FOUND", "That report couldn't be found.");

  if (action === "remove_content") {
    if (report.targetType === "post") {
      const postsCol = await getCollection("posts");
      const post = await postsCol.findOne({ id: report.targetId });
      if (post) {
        deleteUploadedFile(post.beforeImageUrl);
        deleteUploadedFile(post.afterImageUrl);
        await postsCol.deleteOne({ id: report.targetId });
        await (await getCollection("comments")).deleteMany({ postId: report.targetId });
        await (await getCollection("likes")).deleteMany({ postId: report.targetId });
      }
    } else if (report.targetType === "comment") {
      await (await getCollection("comments")).deleteOne({ id: report.targetId });
    }
  } else if (action === "suspend_user" || action === "ban_user") {
    const userIdToModerate = report.targetType === "user" ? report.targetId : null;
    if (userIdToModerate) {
      const setField = action === "suspend_user" ? { suspended: true } : { banned: true };
      await (await getCollection("users")).updateOne({ id: userIdToModerate }, { $set: setField });
    }
  }

  const resolvedFields = {
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    resolvedBy: req.userId,
    resolution: action,
  };
  await reportsCol.updateOne({ id: req.params.id }, { $set: resolvedFields });

  res.json({ report: { ...report, ...resolvedFields } });
});

// Multer errors (file too large, bad type) land here.
router.use ((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return sendError(res, 400, "UPLOAD_ERROR", err.message || "Could not process the uploaded file(s).");
  }
  next();
});

module.exports = router;
