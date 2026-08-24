// In-app notifications: likes, comments, follows, badge unlocks, and
// challenge completions. Kept deliberately simple — no push/email delivery,
// just a record the person sees next time they open LifeLoop.

const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../db");

async function createNotification(userId, type, title, message, link = null) {
  if (!userId) return;
  const newNotification = {
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from('notifications').insert([newNotification]);
  if (error) console.error("Failed to create notification:", error);
}

async function getNotifications(userId, { page = 1, pageSize = 20 } = {}) {
  const { data: allData, count } = await supabase.from('notifications')
    .select('*', { count: 'exact' })
    .eq('userId', userId)
    .order('createdAt', { ascending: false });
    
  const all = allData || [];
  const total = count || 0;
  const unreadCount = all.filter((n) => !n.read).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = all.slice((page - 1) * pageSize, page * pageSize);

  return { items, total, totalPages, unreadCount, page };
}

async function markRead(userId, id) {
  const { data: notification } = await supabase.from('notifications').select('*').eq('id', id).eq('userId', userId).single();
  if (notification && !notification.read) {
    notification.read = true;
    await supabase.from('notifications').update({ read: true }).eq('id', id).eq('userId', userId);
  }
  return notification || null;
}

async function markAllRead(userId) {
  await supabase.from('notifications').update({ read: true }).eq('userId', userId).eq('read', false);
}

module.exports = { createNotification, getNotifications, markRead, markAllRead };
