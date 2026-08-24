require('dotenv').config();
const { supabase } = require('./src/db');
const fs = require('fs');
const path = require('path');

process.env.PORT = "3000";
require('./src/server.js');

const API_BASE = 'http://localhost:3000/api';
let cookie = '';
let userId = '';

async function run() {
  console.log("Starting Manual E2E Test...");
  
  // 1. Auth Registration
  const email = `e2e-${Date.now()}@example.com`;
  console.log(`\n--- 1. Registering ${email} ---`);
  
  let res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E2E User', email, password: 'password123' })
  });
  
  if (!res.ok) throw new Error("Registration failed: " + await res.text());
  const userData = await res.json();
  userId = userData.user.id;
  cookie = res.headers.get('set-cookie');
  console.log(`✅ Registration successful. User ID: ${userId}`);

  // 2. Add Item
  console.log("\n--- 2. Adding Item ---");
  const formData = new FormData();
  formData.append('name', 'E2E Item');
  formData.append('category', 'clothing');
  formData.append('condition', 'good');
  formData.append('runOcr', 'false');

  const sampleImagePath = path.join(__dirname, '..', 'frontend', 'assets', 'images', 'umama.jpg');
  const realBuffer = fs.readFileSync(sampleImagePath);
  formData.append('photos', new Blob([realBuffer], { type: 'image/jpeg' }), 'sample.jpg');

  res = await fetch(`${API_BASE}/items/scan`, {
    method: 'POST',
    headers: { cookie },
    body: formData
  });
  if (!res.ok) throw new Error("Scan failed: " + await res.text());
  
  const scanData = await res.json();
  const itemId = scanData.item.id;
  console.log(`✅ Item added. Item ID: ${itemId}`);

  // 3. Post to Community
  console.log("\n--- 3. Posting to Community ---");
  const postFormData = new FormData();
  postFormData.append('description', 'E2E Test Post');
  res = await fetch(`${API_BASE}/community/posts`, {
    method: 'POST',
    headers: { cookie },
    body: postFormData
  });
  if (!res.ok) throw new Error("Post failed: " + await res.text());
  const postData = await res.json();
  const postId = postData.post.id;
  console.log(`✅ Post created. Post ID: ${postId}`);

  // 4. Like Post
  console.log("\n--- 4. Liking Post ---");
  res = await fetch(`${API_BASE}/community/posts/${postId}/like`, {
    method: 'POST',
    headers: { cookie }
  });
  if (!res.ok) throw new Error("Like failed: " + await res.text());
  console.log("✅ Post liked.");

  // 5. Add Comment
  console.log("\n--- 5. Adding Comment ---");
  res = await fetch(`${API_BASE}/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ text: 'E2E Comment' })
  });
  if (!res.ok) throw new Error("Comment failed: " + await res.text());
  console.log("✅ Comment created.");

  // Verify DB state BEFORE delete
  console.log("\n--- Verifying DB State BEFORE Account Deletion ---");
  let { count: itemsCount } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('userId', userId);
  let { count: postsCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('userId', userId);
  let { count: commentsCount } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('userId', userId);
  let { count: likesCount } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('userId', userId);
  console.log(`Items: ${itemsCount}, Posts: ${postsCount}, Comments: ${commentsCount}, Likes: ${likesCount}`);

  // 6. Delete Account
  console.log("\n--- 6. Deleting Account ---");
  // Our auth.js DELETE /auth/account doesn't exist, wait does it?
  // If not, we can just delete from Supabase directly or via API if we have it.
  // Actually, we don't have an endpoint to delete an account in auth.js!
  // Wait, let's look at routes/auth.js.
  // We'll just delete the user directly via Supabase using the service_role key.
  
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw new Error("Delete user failed: " + error.message);
  console.log("✅ User deleted directly via Supabase.");

  // Verify DB state AFTER delete
  console.log("\n--- Verifying DB State AFTER Account Deletion (Cascade Check) ---");
  ({ count: itemsCount } = await supabase.from('items').select('*', { count: 'exact', head: true }).eq('userId', userId));
  ({ count: postsCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('userId', userId));
  ({ count: commentsCount } = await supabase.from('comments').select('*', { count: 'exact', head: true }).eq('userId', userId));
  ({ count: likesCount } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('userId', userId));
  console.log(`Items: ${itemsCount}, Posts: ${postsCount}, Comments: ${commentsCount}, Likes: ${likesCount}`);

  if (itemsCount === 0 && postsCount === 0 && commentsCount === 0 && likesCount === 0) {
    console.log("\n🎉 E2E TEST PASSED! Cascade deletion worked perfectly. 🎉");
  } else {
    console.log("\n❌ E2E TEST FAILED! Cascade deletion failed for some records.");
  }
  
  process.exit(0);
}

setTimeout(() => {
  run().catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
}, 1000);
