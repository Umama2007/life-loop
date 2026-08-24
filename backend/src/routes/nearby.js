const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");
const { sendError } = require("../utils/errors");
const { isOneOf, toFiniteNumber } = require("../utils/validate");
const { findNearbyPlaces } = require("../services/nearby");

const router = express.Router();

const VALID_ACTIONS = ["donate", "resell", "repair", "recycle"];

// Rate-limited a bit more strictly than most endpoints: this proxies to a
// free, shared public API (Overpass), which asks integrators to use it
// reasonably rather than hammering it.
router.get(
  "/",
  requireAuth,
  rateLimit({ windowMs: 5 * 60 * 1000, max: 20, message: "Too many nearby-place searches in a short time. Please wait a bit." }),
  async (req, res) => {
    const action = req.query.action;
    const latitude = toFiniteNumber(req.query.lat);
    const longitude = toFiniteNumber(req.query.lng);
    const radiusMeters = toFiniteNumber(req.query.radius);

    if (!isOneOf(action, VALID_ACTIONS)) {
      return sendError(res, 400, "INVALID_ACTION", `action must be one of: ${VALID_ACTIONS.join(", ")}`);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return sendError(res, 400, "MISSING_LOCATION", "Valid lat/lng query parameters are required.");
    }

    try {
      const places = await findNearbyPlaces({
        latitude,
        longitude,
        action,
        radiusMeters: Number.isFinite(radiusMeters) ? Math.min(radiusMeters, 20000) : undefined,
      });
      res.json({
        places,
        source: "OpenStreetMap (via Overpass)",
        note: "Results come from community-maintained map data and may be incomplete or out of date for your area.",
      });
    } catch (err) {
      console.error("Nearby-places search failed:", err.message);
      sendError(res, 502, "NEARBY_SEARCH_FAILED", "Could not search for nearby places right now. Please try again in a moment.");
    }
  }
);

module.exports = router;
