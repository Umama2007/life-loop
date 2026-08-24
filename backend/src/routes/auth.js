const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection } = require("../db");
const { requireAuth, COOKIE_NAME } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { sendError } = require("../utils/errors");
const { isValidEmail } = require("../utils/validate");

const router = express.Router();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, isAdmin: Boolean(user.isAdmin) };
}

function setSessionCookie(res, userId, rememberMe) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: rememberMe ? "30d" : "1d",
  });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "none",
    secure: true, // Required by browsers for SameSite=None
  };
  if (rememberMe) cookieOptions.maxAge = SEVEN_DAYS_MS * (30 / 7);
  res.cookie(COOKIE_NAME, token, cookieOptions);
}

router.post("/register", authRateLimit, async (req, res) => {
  const { name, email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  console.log("[AUTH-REGISTER] Request received for email:", cleanEmail);
  const cleanName = String(name || "").trim();

  if (cleanName.length < 2) {
    return sendError(res, 400, "INVALID_NAME", "Enter at least 2 characters for your name.");
  }
  if (!isValidEmail(cleanEmail)) {
    return sendError(res, 400, "INVALID_EMAIL", "Enter a valid email address.");
  }
  if (!password || password.length < 6) {
    return sendError(res, 400, "WEAK_PASSWORD", "Password must be at least 6 characters.");
  }

  console.log("[AUTH-REGISTER] About to read users from MongoDB...");
  const users = await readCollection("users");
  if (users.some((u) => u.email === cleanEmail)) {
    return sendError(res, 409, "EMAIL_TAKEN", "An account with that email already exists. Try signing in instead.");
  }

  const user = {
    id: uuidv4(),
    name: cleanName,
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    isAdmin: users.length === 0, // first registered account on a fresh install becomes admin
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  console.log("[AUTH-REGISTER] MongoDB read complete. Writing new user...");
  await writeCollection("users", users);
  console.log("[AUTH-REGISTER] User written successfully.");

  setSessionCookie(res, user.id, Boolean(req.body.rememberMe));
  res.status(201).json({ user: publicUser(user) });
});

router.post("/login", authRateLimit, async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();

  const users = await readCollection("users");
  const user = users.find((u) => u.email === cleanEmail);

  if (!user || !bcrypt.compareSync(String(password || ""), user.passwordHash)) {
    return sendError(res, 401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  }

  setSessionCookie(res, user.id, Boolean(rememberMe));
  res.json({ user: publicUser(user) });
});

router.post ("/logout", async (req, res) => {
  res.clearCookie(COOKIE_NAME, { sameSite: "none", secure: true });
  res.json({ success: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const users = await readCollection("users");
  const user = users.find((u) => u.id === req.userId);
  if (!user) return sendError(res, 401, "NOT_SIGNED_IN", "Not signed in.");
  res.json({ user: publicUser(user) });
});

module.exports = router;
