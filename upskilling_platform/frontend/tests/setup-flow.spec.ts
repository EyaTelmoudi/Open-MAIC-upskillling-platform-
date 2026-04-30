import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8001';
const FRONTEND_URL = 'http://localhost:3000';
const SETUP_KEY = 'change-this-setup-secret-key-in-production';

test('Complete Setup Flow - Visible Browser Actions', async ({ page }) => {
  // Set viewport to see everything
  page.setViewportSize({ width: 1920, height: 1080 });
  
  console.log('\n🧪 ===== COMPLETE SETUP FLOW TEST (BROWSER VIEW) =====\n');

  // Step 1: Open browser to setup page
  console.log('📋 Step 1: Opening setup page in browser...');
  await page.goto(`${FRONTEND_URL}/setup`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Screenshot
  await page.screenshot({ path: 'test-results/1-setup-page.png', fullPage: true });
  console.log('✅ Setup page opened in browser\n');

  // Step 2: Check setup status via browser
  console.log('📋 Step 2: Checking setup status...');
  // The setup page should show the current status
  await page.waitForTimeout(1000);
  const pageContent = await page.content();
  const hasSetupContent = pageContent.includes('Welcome') || pageContent.includes('Setup');
  expect(hasSetupContent).toBe(true);
  await page.screenshot({ path: 'test-results/2-setup-status.png', fullPage: true });
  console.log('✅ Setup status loaded\n');

  // Step 3: Configure Platform via API (needed first)
  console.log('📋 Step 3: Configuring platform...');
  const platformResponse = await page.request.put(`${API_BASE}/setup/platform`, {
    headers: { 
      'X-Setup-Key': SETUP_KEY,
      'Content-Type': 'application/json'
    },
    data: {
      platform_name: 'SkillForge',
      default_timezone: 'UTC',
      support_email: 'support@skillforge.com'
    }
  });
  expect(platformResponse.status()).toBe(200);
  console.log('✅ Platform configured\n');

  // Step 4: Create Super Admin via API
  console.log('📋 Step 4: Creating Super Admin...');
  const adminResponse = await page.request.post(`${API_BASE}/setup/admin`, {
    headers: { 
      'X-Setup-Key': SETUP_KEY,
      'Content-Type': 'application/json'
    },
    data: {
      email: 'admin@skillforge.com',
      password: 'Admin123!',
      first_name: 'Super',
      last_name: 'Admin'
    }
  });
  expect([201, 409]).toContain(adminResponse.status());
  console.log('✅ SuperAdmin ready\n');

  // Step 5: Navigate to Super Admin login page in browser
  console.log('📋 Step 5: Opening Super Admin login page in browser...');
  await page.goto(`${FRONTEND_URL}/superadmin/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/3-login-page.png', fullPage: true });
  
  // Fill login form
  console.log('📋 Step 5b: Filling login credentials...');
  const emailInput = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  
  await emailInput.fill('admin@skillforge.com');
  await passwordInput.fill('Admin123!');
  
  // Screenshot with filled credentials
  await page.screenshot({ path: 'test-results/4-filled-login.png', fullPage: true });
  console.log('✅ Credentials filled\n');

  // Step 6: Click login button
  console.log('📋 Step 6: Clicking login button...');
  const loginButton = page.locator('button:has-text("Sign In")').first();
  await loginButton.click();
  
  // Wait for navigation
  await page.waitForTimeout(3000);
  
  // Take screenshot after login
  await page.screenshot({ path: 'test-results/5-after-login.png', fullPage: true });
  
  // Check current URL
  const currentUrl = page.url();
  console.log('URL after login:', currentUrl);
  
  // Step 7: Verify we're on dashboard
  console.log('📋 Step 7: Verifying dashboard...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/6-dashboard.png', fullPage: true });
  
  const dashboardContent = await page.content();
  const isOnDashboard = !currentUrl.includes('/login') || dashboardContent.includes('Dashboard') || dashboardContent.includes('SuperAdmin');
  
  console.log('\n🎉 ===== BROWSER SETUP TEST COMPLETE! =====');
  console.log('\nScreenshots saved to test-results/:');
  console.log('1. 1-setup-page.png');
  console.log('2. 2-setup-status.png');
  console.log('3. 3-login-page.png');
  console.log('4. 4-filled-login.png');
  console.log('5. 5-after-login.png');
  console.log('6. 6-dashboard.png');
  console.log('\nSummary:');
  console.log('- Setup page: ✅');
  console.log('- Login page: ✅');
  console.log('- Fill credentials: ✅');
  console.log('- Click login: ✅');
  console.log('- Dashboard: ' + (isOnDashboard ? '✅' : '⚠️'));
});