// In-app notifications: likes, comments, follows, badge unlocks, and
// challenge completions. Kept deliberately simple — no push/email delivery,
// just a record the person sees next time they open LifeLoop.

const { v4: uuidv4 } = require("uuid");
const { readCollection, writeCollection } = require("../db");

async function createNotification(userId, type, title, message, link = null) {
  if (!userId) return;
  const notifications = await readCollection("notifications");
  notifications.push({
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  });
  await writeCollection("notifications", notifications);
}

async function getNotifications(userId, { page = 1, pageSize = 20 } = {}) {
  const all = (await readCollection("notifications"))
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = all.length;
  const unreadCount = all.filter((n) => !n.read).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = all.slice((page - 1) * pageSize, page * pageSize);

  return { items, total, totalPages, unreadCount, page };
}

async function markRead(userId, id) {
  const notifications = await readCollection("notifications");
  const notification = notifications.find((n) => n.id === id && n.userId === userId);
  if (notification && !notification.read) {
    notification.read = true;
    await writeCollection("notifications", notifications);
  }
  return notification || null;
}

async function markAllRead(userId) {
  const notifications = await readCollection("notifications");
  let changed = false;
  for (const n of notifications) {
    if (n.userId === userId && !n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) await writeCollection("notifications", notifications);
}

module.exports = { createNotification, getNotifications, markRead, markAllRead };
