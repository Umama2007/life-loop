const jwt = require("jsonwebtoken");
const { sendError } = require("../utils/errors");
const { readCollection } = require("../db");

const COOKIE_NAME = "lifeloop_token";

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return sendError(res, 401, "NOT_SIGNED_IN", "Not signed in.");

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = readCollection("users").find((u) => u.id === payload.userId);
    if (!user) return sendError(res, 401, "NOT_SIGNED_IN", "Not signed in.");
    if (user.banned) return sendError(res, 403, "ACCOUNT_BANNED", "This account has been banned.");
    if (user.suspended) return sendError(res, 403, "ACCOUNT_SUSPENDED", "This account is temporarily suspended.");

    req.userId = payload.userId;
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    return sendError(res, 401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }
}

function requireAdmin(req, res, next) {
  const user = readCollection("users").find((u) => u.id === req.userId);
  if (!user?.isAdmin) return sendError(res, 403, "ADMIN_REQUIRED", "This action requires an administrator account.");
  next();
}

module.exports = { requireAuth, requireAdmin, COOKIE_NAME };
