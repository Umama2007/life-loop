require('dotenv').config();
const { Redis } = require("@upstash/redis");

async function run() {
  console.log("URL:", process.env.UPSTASH_REDIS_REST_URL);
  
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("Missing Upstash variables in .env");
    process.exit(1);
  }
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  try {
    console.log("Pinging Redis...");
    const start = Date.now();
    const result = await redis.ping();
    console.log(`Success! Ping returned: ${result} in ${Date.now() - start}ms`);
  } catch (err) {
    console.error("Redis ping failed:", err);
  }
}

run();
