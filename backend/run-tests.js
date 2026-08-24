require('dotenv').config();

async function runTestServer() {
  console.log("Starting backend server with Supabase...");
  process.env.PORT = "3000";
  
  require('./src/server.js');
  
  // Wait 1 second for the server to start, then run tests
  setTimeout(() => {
    require('./regression.js');
  }, 1000);
}

runTestServer().catch(console.error);
