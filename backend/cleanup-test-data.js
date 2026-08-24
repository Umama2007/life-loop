require("dotenv").config();
const { supabase } = require("./src/db");

async function cleanup() {
  console.log("Looking for test users...");
  
  // Find users with 'test-' in their email (like test-1787590333991@example.com)
  const { data: testUsers, error: fetchError } = await supabase
    .from("users")
    .select("id, email")
    .like("email", "test-%@example.com");
    
  if (fetchError) {
    console.error("Error fetching test users:", fetchError);
    process.exit(1);
  }
  
  if (!testUsers || testUsers.length === 0) {
    console.log("No test users found. Database is clean.");
    process.exit(0);
  }
  
  console.log(`Found ${testUsers.length} test users. Deleting them...`);
  
  // Delete all found test users. 
  // Thanks to ON DELETE CASCADE on all related tables (posts, comments, items, likes, etc.),
  // this single operation will automatically wipe out all the junk data they created.
  const userIds = testUsers.map(u => u.id);
  
  const { error: deleteError } = await supabase
    .from("users")
    .delete()
    .in("id", userIds);
    
  if (deleteError) {
    console.error("Error deleting test users:", deleteError);
    process.exit(1);
  }
  
  console.log(`Successfully deleted ${testUsers.length} test users and all their associated posts, items, comments, and likes!`);
}

cleanup();
