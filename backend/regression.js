const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
let cookie = '';

async function run() {
  console.log("Starting Regression Test Pass...");
  
  // 1. Auth Registration & Login
  const email = `test-${Date.now()}@example.com`;
  console.log(`\n--- 1. Testing Auth (Registering ${email}) ---`);
  
  let res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email, password: 'password123' })
  });
  
  if (!res.ok) throw new Error("Registration failed: " + await res.text());
  cookie = res.headers.get('set-cookie');
  console.log("✅ Registration successful. Cookie received.");

  res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' })
  });
  if (!res.ok) throw new Error("Login failed: " + await res.text());
  console.log("✅ Login successful.");

  // 2. Scanning & DB Persistence
  console.log("\n--- 2. Testing Scanning & DB Persistence ---");
  const formData = new FormData();
  formData.append('name', 'Test Scanner Item');
  formData.append('category', 'clothing');
  formData.append('condition', 'good');
  formData.append('runOcr', 'false');

  // Read a real image from disk
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
  console.log("✅ Scan completed successfully. Item ID: " + itemId);
  
  // Verify persistence by fetching it on a second request
  res = await fetch(`${API_BASE}/items/${itemId}`, { headers: { cookie } });
  if (!res.ok) throw new Error("Could not fetch newly created item from DB");
  const fetchedItem = await res.json();
  console.log(`✅ Item fetched from DB successfully. Name: "${fetchedItem.item.name}"`);
  console.log("📷 Item images field from DB:", JSON.stringify(fetchedItem.item.images, null, 2));

  // 3. Chatbot
  console.log("\n--- 3. Testing Synchronous Chatbot (Ask LifeLoop) ---");
  res = await fetch(`${API_BASE}/items/${itemId}/chat/canIRepair`, { headers: { cookie } });
  if (!res.ok) throw new Error("Chatbot failed: " + await res.text());
  const chatData = await res.json();
  console.log("✅ Chatbot returned: " + JSON.stringify(chatData));

  // 4. Community Post, Comment, Like
  console.log("\n--- 4. Testing Community ---");
  const postFormData = new FormData();
  postFormData.append('description', 'This is a test post for regression');
  res = await fetch(`${API_BASE}/community/posts`, {
    method: 'POST',
    headers: { cookie },
    body: postFormData
  });
  if (!res.ok) throw new Error("Post creation failed: " + await res.text());
  const postData = await res.json();
  const postId = postData.post.id;
  console.log(`✅ Community post created. Post ID: ${postId}`);

  // Comment
  res = await fetch(`${API_BASE}/community/posts/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ text: 'This is a test comment' })
  });
  if (!res.ok) throw new Error("Comment failed: " + await res.text());
  console.log("✅ Comment created.");

  // Like
  res = await fetch(`${API_BASE}/community/posts/${postId}/like`, {
    method: 'POST',
    headers: { cookie }
  });
  if (!res.ok) throw new Error("Like failed: " + await res.text());
  console.log("✅ Post liked.");

  // 5. Testing Concurrent Writes (Race Condition Protection)
  console.log("\n--- 5. Testing Concurrent Writes (Race Condition Protection) ---");
  const postAForm = new FormData();
  postAForm.append('description', 'Concurrent Post Alpha ' + Date.now());
  const postBForm = new FormData();
  postBForm.append('description', 'Concurrent Post Beta ' + Date.now());

  const [resA, resB] = await Promise.all([
    fetch(`${API_BASE}/community/posts`, { method: 'POST', headers: { cookie }, body: postAForm }),
    fetch(`${API_BASE}/community/posts`, { method: 'POST', headers: { cookie }, body: postBForm }),
  ]);

  if (!resA.ok || !resB.ok) throw new Error("Concurrent post creation failed");
  const dataA = await resA.json();
  const dataB = await resB.json();

  // Verify both posts exist in the collection
  const checkRes = await fetch(`${API_BASE}/community/posts?pageSize=50`, { headers: { cookie } });
  const checkData = await checkRes.json();
  const foundA = checkData.posts.some((p) => p.id === dataA.post.id);
  const foundB = checkData.posts.some((p) => p.id === dataB.post.id);

  if (!foundA || !foundB) {
    throw new Error(`Race condition detected! Found Alpha: ${foundA}, Found Beta: ${foundB}`);
  }
  console.log(`✅ Concurrent write test passed! Both records persisted atomically.\n   Alpha Post ID: ${dataA.post.id}\n   Beta Post ID: ${dataB.post.id}`);

  console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉");
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
