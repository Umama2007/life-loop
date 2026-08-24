const { MongoClient } = require("mongodb");

if (!process.env.MONGODB_URI) {
  console.error("Missing MONGODB_URI. Set it in backend/.env to connect to your database.");
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
let dbPromise = client.connect().then(() => client.db());

async function getDb() {
  return await dbPromise;
}

// In this MongoDB adaptation for Vercel, we keep the original 
// readCollection/writeCollection contract (reading and writing arrays of objects)
// to minimize restructuring across the codebase. 

async function readCollection(name) {
  const db = await getDb();
  // Fetch all documents as an array, stripping the internal _id to keep the 
  // shape exactly as the rest of the app expects.
  const records = await db.collection(name).find({}, { projection: { _id: 0 } }).toArray();
  return records;
}

async function writeCollection(name, records) {
  const db = await getDb();
  const col = db.collection(name);
  
  if (!records || records.length === 0) {
    await col.deleteMany({});
    return;
  }

  const idsToKeep = records.map(r => r.id).filter(Boolean);
  
  const bulkOps = records.map(record => ({
    replaceOne: {
      filter: { id: record.id },
      replacement: record,
      upsert: true
    }
  }));

  if (bulkOps.length > 0) {
    await col.bulkWrite(bulkOps);
  }

  if (idsToKeep.length > 0) {
    await col.deleteMany({ id: { $nin: idsToKeep } });
  } else {
    await col.deleteMany({});
  }
}

async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

module.exports = { readCollection, writeCollection, getDb, getCollection };
