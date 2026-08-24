const { MongoMemoryServer } = require('mongodb-memory-server');

async function runTestServer() {
  console.log("Starting mock MongoDB for testing...");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = "testsecret";
  process.env.PORT = "3000";
  
  console.log("Starting backend server...");
  require('./src/server.js');
  
  // Wait 1 second for the server to start, then run tests
  setTimeout(() => {
    require('./regression.js');
  }, 1000);
}

runTestServer().catch(console.error);
