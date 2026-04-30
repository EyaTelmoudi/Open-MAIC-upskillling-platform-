const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'upskilling',
  password: 'upskilling_dev_2026',
  database: 'upskilling_platform'
});

async function checkSuperAdmin() {
  try {
    const result = await pool.query(
      "SELECT id, email, first_name, last_name, role, status FROM users WHERE role = 'SuperAdmin'"
    );
    
    console.log('═══════════════════════════════════════');
    console.log('🔍 Super Admin Check');
    console.log('═══════════════════════════════════════');
    console.log(`Total Super Admins: ${result.rows.length}`);
    console.log('');
    
    if (result.rows.length > 0) {
      result.rows.forEach(u => {
        console.log(`📧 Email: ${u.email}`);
        console.log(`👤 Name: ${u.first_name} ${u.last_name}`);
        console.log(`🎭 Role: ${u.role}`);
        console.log(`📊 Status: ${u.status}`);
        console.log(`🆔 ID: ${u.id}`);
        console.log('───────────────────────────────────────');
      });
    } else {
      console.log('❌ No Super Admin found in database');
    }
    
    console.log('═══════════════════════════════════════');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSuperAdmin();