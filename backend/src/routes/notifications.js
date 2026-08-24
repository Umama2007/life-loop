const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { sendError } = require("../utils/errors");
const { clampPagination } = require("../utils/validate");
const notifications = require("../services/notifications");

const router = express.Router();

router.get ("/", requireAuth, async (req, res) => {
  const { page, pageSize } = clampPagination(req.query.page, req.query.pageSize);
  const result = await notifications.getNotifications(req.userId, { page, pageSize });
  res.json({
    notifications: result.items,
    unreadCount: result.unreadCount,
    page: result.page,
    total: result.total,
    totalPages: result.totalPages,
  });
});

router.post ("/:id/read", requireAuth, async (req, res) => {
  const notification = await notifications.markRead(req.userId, req.params.id);
  if (!notification) return sendError(res, 404, "NOTIFICATION_NOT_FOUND", "That notification couldn't be found.");
  res.json({ notification });
});

router.post ("/read-all", requireAuth, async (req, res) => {
  await notifications.markAllRead(req.userId);
  res.json({ success: true });
});

module.exports = router;
