const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { sendError } = require("../utils/errors");
const jobQueue = require("../services/jobQueue");

const router = express.Router();

// Jobs aren't tied to a user record in this simple queue, so we don't
// enforce per-user ownership here — but we do require the requester to be
// signed in to something, so a job id can't be polled by a fully anonymous
// caller.
router.get("/:id", requireAuth, (req, res) => {
  const job = jobQueue.getJob(req.params.id);
  if (!job) return sendError(res, 404, "JOB_NOT_FOUND", "That job couldn't be found.");
  res.json({ job });
});

module.exports = router;
