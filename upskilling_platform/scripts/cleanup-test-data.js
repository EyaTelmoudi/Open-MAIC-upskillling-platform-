const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'upskilling',
  password: 'upskilling_dev_2026',
  database: 'upskilling_platform'
});

async function cleanupTestData() {
  try {
    console.log('🧹 Cleaning up test data...');
    
    // Delete test admins by email pattern
    const deletedUsers = await pool.query(
      "DELETE FROM users WHERE email LIKE 'test-admin%@skillforge.io' RETURNING email, id"
    );
    
    console.log(`✅ Deleted ${deletedUsers.rowCount} test admin(s):`);
    deletedUsers.rows.forEach(u => console.log(`   - ${u.email}`));
    
    // Verify cleanup
    const remaining = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE email LIKE 'test-admin%@skillforge.io'"
    );
    
    console.log(`\n📊 Remaining test users: ${remaining.rows[0].count}`);
    console.log('✅ Database is now clean!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

cleanupTestData();