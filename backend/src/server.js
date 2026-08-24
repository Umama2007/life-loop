require("dotenv").config();

// Last line of defense: an unexpected error in any async code path (a
// timer callback, a stray promise, a library internal) should never be
// able to take down the entire server process. Without this, one bad edge
// case anywhere in the app — even in a dependency — kills LifeLoop for
// every request, not just the one that triggered it. We log it clearly and
// keep running instead.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server is still running):", err?.stack || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server is still running):", reason?.stack || reason);
});

const path = require("path");
const express = require("express");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth");
const itemsRoutes = require("./routes/items");
const communityRoutes = require("./routes/community");
const notificationsRoutes = require("./routes/notifications");
const jobsRoutes = require("./routes/jobs");
const nearbyRoutes = require("./routes/nearby");
const jobQueue = require("./services/jobQueue");
const { ensureDataFiles } = require("./db");
const swaggerUi = require("swagger-ui-express");
const openapiSpec = require("../openapi.json");

if (!process.env.JWT_SECRET) {
  console.error(
    "Missing JWT_SECRET. Copy backend/.env.example to backend/.env and set a JWT_SECRET before starting the server."
  );
  process.exit(1);
}

ensureDataFiles();
jobQueue.recoverStaleJobs();

const app = express();
app.set('trust proxy', 1); // Trust reverse proxy so secure cookies and rate limiters work
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "uploads");

// A handful of standard security headers. LifeLoop's frontend and API are
// served from the same origin (this same Express app), so there is no
// legitimate cross-origin use case — CORS middleware was deliberately
// removed rather than configured, since permissive CORS with credentials
// enabled is unnecessary attack surface for an app that never needs it.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(compression());
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/nearby", nearbyRoutes);
app.get("/api/openapi.json", (req, res) => res.json(openapiSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1h" }));

// Serve the existing frontend (login.html, index.html, css/, js/) as-is.
app.use(express.static(FRONTEND_DIR, { index: "login.html", maxAge: "1h" }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Unhandled error:", err?.message || err);
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: status === 400 ? (err.message || "Bad request.") : "Something went wrong on our end. Please try again.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LifeLoop API running at http://0.0.0.0:${PORT}`);
});
