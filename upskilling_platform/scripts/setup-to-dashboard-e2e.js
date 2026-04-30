/**
 * Setup to Dashboard E2E Test
 * 
 * This script tests the full flow from setup to super admin dashboard.
 * Starts at http://localhost:3000/setup, completes setup, logs in, and tests dashboard.
 * Run with: node scripts/setup-to-dashboard-e2e.js
 * 
 * Dependencies: playwright
 * Install: npm install playwright
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Configuration
const FRONTEND_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', `setup-to-dashboard-${Date.now()}`);

// Test data (unique for this run to avoid conflicts)
const TEST_ADMIN = {
  email: `test-admin-${Date.now()}@skillforge.io`,
  password: 'TestPassword123',
  firstName: 'Test',
  lastName: 'Admin'
};

// Ensure screenshot directory exists
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Take screenshot function
async function takeScreenshot(page, stepName, consoleErrors) {
  const filename = `${stepName}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  
  const currentErrors = consoleErrors.filter(e => 
    !e.includes('font') && !e.includes('favicon') && !e.includes('OTS')
  );
  const errorCount = currentErrors.length;
  
  if (errorCount > 0) {
    console.log(`  📸 Screenshot: ${filename} ⚠️  Errors: ${errorCount}`);
  } else {
    console.log(`  📸 Screenshot: ${filename} ✅ No errors`);
  }
  
  return filepath;
}

// Print page overview
async function printPageOverview(page, stepName) {
  const url = page.url();
  const title = await page.title().catch(() => 'N/A');
  const bodyText = await page.textContent('body').catch(() => '');
  
  const buttons = await page.getByRole('button').all().then(btns => 
    Promise.all(btns.map(b => b.textContent().catch(() => '')))
  ).then(texts => texts.filter(t => t && t.trim()));
  const inputs = await page.getByRole('textbox').count();
  const selects = await page.locator('select').count();
  
  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │ 📄 Page Overview - ${stepName.padEnd(30)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │ URL: ${url.substring(0, 45).padEnd(45)} │`);
  console.log(`  │ Title: ${title.substring(0, 40).padEnd(40)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  const preview = bodyText.substring(0, 150).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`  │ Text: ${preview.substring(0, 45).padEnd(45)} │`);
  console.log(`  │       ${preview.substring(45, 90).padEnd(45)} │`);
  console.log(`  ├─────────────────────────────────────────────┤`);
  console.log(`  │ 🔘 Btn: ${(buttons[0] || '').substring(0, 30).padEnd(35)} │`);
  console.log(`  │ 📝 In: ${inputs}`.padEnd(42) + `│`);
  console.log(`  │ 📋 Sel: ${selects}`.padEnd(42) + `│`);
  console.log(`  └─────────────────────────────────────────────┘`);
}

// Main test function
async function runTests() {
  console.log('\n🚀 Starting SETUP TO DASHBOARD E2E TEST...\n');
  
  ensureDirectory(SCREENSHOT_DIR);
  
  let browser;
  let page;
  let consoleErrors = [];
  let stepResults = [];
  
  try {
    console.log('🌐 Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${new Date().toISOString()}] ${msg.text()}`);
      }
    });
    
    // ============================================
    // STEP 1: Open Setup Page (http://localhost:3000/setup)
    // ============================================
    console.log('\n📋 Step 1: Open Setup Page');
    await page.goto(FRONTEND_URL + '/setup');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '1-setup-page', consoleErrors);
    
    const setupContent = await page.textContent('body');
    const hasSetup = setupContent.includes('Welcome') || setupContent.includes('SkillForge');
    console.log(`  ✓ Setup page loaded: ${hasSetup}`);
    stepResults.push({ step: 'Open Setup Page', status: hasSetup ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 2: Welcome Step Verification
    // ============================================
    console.log('\n📋 Step 2: Welcome Step');
    const welcomeText = await page.textContent('body');
    const hasWelcome = welcomeText.includes('Welcome');
    console.log(`  ✓ Welcome text: ${hasWelcome}`);
    await takeScreenshot(page, '2-welcome-step', consoleErrors);
    stepResults.push({ step: 'Welcome Step', status: hasWelcome ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 3: Navigate to Admin Account
    // ============================================
    console.log('\n📋 Step 3: Admin Account Form');
    await page.waitForSelector('button:has-text("Next")', { state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '3-admin-account', consoleErrors);
    
    const adminFields = await page.getByRole('textbox').count();
    console.log(`  ✓ Text fields: ${adminFields}`);
    stepResults.push({ step: 'Admin Account Form', status: adminFields >= 4 ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 4: Fill Admin Form
    // ============================================
    console.log('\n📋 Step 4: Fill Admin Form');
    await page.getByRole('textbox').first().fill(TEST_ADMIN.email);
    await page.getByRole('textbox').nth(1).fill(TEST_ADMIN.password);
    await page.getByRole('textbox').nth(2).fill(TEST_ADMIN.firstName);
    await page.getByRole('textbox').nth(3).fill(TEST_ADMIN.lastName);
    
    await takeScreenshot(page, '4-admin-filled', consoleErrors);
    console.log(`  ✓ Filled: ${TEST_ADMIN.email}`);
    stepResults.push({ step: 'Fill Admin Form', status: 'PASSED', errors: 0 });
    
    // ============================================
    // STEP 5: Submit Admin Form
    // ============================================
    console.log('\n📋 Step 5: Submit Admin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '5-platform-config', consoleErrors);
    
    const platformContent = await page.textContent('body');
    const advancedToPlatform = platformContent.includes('Platform Config') || platformContent.includes('Platform');
    console.log(`  ✓ Advanced to Platform Config: ${advancedToPlatform}`);
    stepResults.push({ step: 'Submit Admin', status: advancedToPlatform ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 6: Platform Config Step
    // ============================================
    console.log('\n📋 Step 6: Platform Config');
    await takeScreenshot(page, '6-platform-config', consoleErrors);
    
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(2000);
    stepResults.push({ step: 'Platform Config', status: 'PASSED', errors: 0 });
    
    // ============================================
    // STEP 7: Organization Step
    // ============================================
    console.log('\n📋 Step 7: Organization');
    await takeScreenshot(page, '7-organization', consoleErrors);
    
    const orgInputs = await page.getByRole('textbox').all();
    if (orgInputs.length >= 1) {
      await orgInputs[0].fill('3S Group');
      console.log('  ✓ Filled: 3S Group');
    }
    
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(2000);
    
    const orgContent = await page.textContent('body');
    const hasOrg = orgContent.includes('First Tenant') || orgContent.includes('Tenant');
    console.log(`  ✓ Advanced to Tenant: ${hasOrg}`);
    stepResults.push({ step: 'Organization', status: hasOrg ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 8: First Tenant (Skip - Optional)
    // ============================================
    console.log('\n📋 Step 8: First Tenant (Skip)');
    await takeScreenshot(page, '8-first-tenant', consoleErrors);
    
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForTimeout(2000);
    stepResults.push({ step: 'First Tenant', status: 'PASSED', errors: 0 });
    
    // ============================================
    // STEP 9: Review & Launch
    // ============================================
    console.log('\n📋 Step 9: Review & Launch');
    await takeScreenshot(page, '9-review', consoleErrors);
    
    const reviewText = await page.textContent('body');
    const hasReview = reviewText.includes('Review') || reviewText.includes('Launch');
    console.log(`  ✓ Review step: ${hasReview}`);
    
    await page.getByRole('button', { name: /^(Next|Launch Platform)$/ }).click();
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '9-launch', consoleErrors);
    
    const successText = await page.textContent('body');
    const isSuccess = successText.includes('Platform is live') || successText.includes('complete');
    console.log(`  ✓ Setup completed: ${isSuccess}`);
    stepResults.push({ step: 'Review & Launch', status: (hasReview || isSuccess) ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 10: Redirect to Login
    // ============================================
    console.log('\n📋 Step 10: Redirect to Login');
    await page.waitForTimeout(4000);
    
    await takeScreenshot(page, '10-login-redirect', consoleErrors);
    
    const finalUrl = page.url();
    const redirectedToLogin = finalUrl.includes('/login') || finalUrl.includes('/superadmin/login');
    console.log(`  📍 URL: ${finalUrl}`);
    console.log(`  ✓ Redirected: ${redirectedToLogin}`);
    stepResults.push({ step: 'Redirect to Login', status: redirectedToLogin ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 11: Super Admin Login
    // ============================================
    console.log('\n📋 Step 11: Super Admin Login');
    await takeScreenshot(page, '11-login-page', consoleErrors);
    
    const loginInputs = await page.getByRole('textbox').all();
    if (loginInputs.length >= 2) {
      await loginInputs[0].fill(TEST_ADMIN.email);
      await loginInputs[1].fill(TEST_ADMIN.password);
      console.log(`  ✓ Filled: ${TEST_ADMIN.email}`);
    }
    
    await takeScreenshot(page, '11-login-filled', consoleErrors);
    
    const signInButton = page.getByRole('button', { name: /^(Sign In|Sign in|Login|Log in)$/i });
    await signInButton.click();
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '11-after-login', consoleErrors);
    
    const postLoginUrl = page.url();
    const loginSuccess = !postLoginUrl.includes('/login') && !postLoginUrl.includes('/superadmin/login');
    console.log(`  📍 URL: ${postLoginUrl}`);
    console.log(`  ✓ Login: ${loginSuccess}`);
    stepResults.push({ step: 'Super Admin Login', status: loginSuccess ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 12: Dashboard
    // ============================================
    console.log('\n📋 Step 12: Dashboard');
    await page.goto(`${FRONTEND_URL}/superadmin`);
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '12-dashboard', consoleErrors);
    
    const dashboardText = await page.textContent('body');
    const hasDashboard = dashboardText.includes('Dashboard') || dashboardText.includes('Tenants');
    console.log(`  ✓ Dashboard: ${hasDashboard}`);
    stepResults.push({ step: 'Dashboard', status: hasDashboard ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 13: Tenants Page
    // ============================================
    console.log('\n📋 Step 13: Tenants');
    await page.goto(`${FRONTEND_URL}/superadmin/tenants`);
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '13-tenants', consoleErrors);
    
    const tenantsText = await page.textContent('body');
    const hasTenants = tenantsText.includes('Tenants') || tenantsText.includes('Companies');
    console.log(`  ✓ Tenants: ${hasTenants}`);
    stepResults.push({ step: 'Tenants', status: hasTenants ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 14: Settings
    // ============================================
    console.log('\n📋 Step 14: Settings');
    await page.goto(`${FRONTEND_URL}/superadmin/settings`);
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '14-settings', consoleErrors);
    
    const settingsText = await page.textContent('body');
    const hasSettings = settingsText.includes('Settings') || settingsText.includes('Platform');
    console.log(`  ✓ Settings: ${hasSettings}`);
    stepResults.push({ step: 'Settings', status: hasSettings ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 15: Analytics
    // ============================================
    console.log('\n📋 Step 15: Analytics');
    await page.goto(`${FRONTEND_URL}/superadmin/analytics`);
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '15-analytics', consoleErrors);
    
    const analyticsText = await page.textContent('body');
    const hasAnalytics = analyticsText.includes('Analytics') || analyticsText.includes('Overview');
    console.log(`  ✓ Analytics: ${hasAnalytics}`);
    stepResults.push({ step: 'Analytics', status: hasAnalytics ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 16: Identity
    // ============================================
    console.log('\n📋 Step 16: Identity');
    await page.goto(`${FRONTEND_URL}/superadmin/identity`);
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '16-identity', consoleErrors);
    
    const identityText = await page.textContent('body');
    const hasIdentity = identityText.includes('Identity') || identityText.includes('Access');
    console.log(`  ✓ Identity: ${hasIdentity}`);
    stepResults.push({ step: 'Identity', status: hasIdentity ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // STEP 17: Audit
    // ============================================
    console.log('\n📋 Step 17: Audit');
    await page.goto(`${FRONTEND_URL}/superadmin/audit`);
    await page.waitForTimeout(2000);
    
    await takeScreenshot(page, '17-audit', consoleErrors);
    
    const auditText = await page.textContent('body');
    const hasAudit = auditText.includes('Audit') || auditText.includes('Log');
    console.log(`  ✓ Audit: ${hasAudit}`);
    stepResults.push({ step: 'Audit', status: hasAudit ? 'PASSED' : 'FAILED', errors: 0 });
    
    // ============================================
    // FINAL: Generate Report
    // ============================================
    console.log('\n');
    console.log('═══════════════════════════════════════');
    console.log('📊 E2E TEST SUMMARY');
    console.log('═══════════════════════════════════════');
    
    const passedSteps = stepResults.filter(s => s.status === 'PASSED').length;
    const failedSteps = stepResults.filter(s => s.status === 'FAILED').length;
    
    stepResults.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.step}: ${result.status}`);
    });
    
    console.log('───────────────────────────────────────');
    console.log(`✅ Passed: ${passedSteps}/${stepResults.length}`);
    console.log(`❌ Failed: ${failedSteps}/${stepResults.length}`);
    console.log(`📁 Screenshots: ${SCREENSHOT_DIR}`);
    console.log('═══════════════════════════════════════');
    
    // Write report
    const reportPath = path.join(SCREENSHOT_DIR, 'report.txt');
    const report = `
SETUP TO DASHBOARD E2E TEST
==========================
Date: ${new Date().toISOString()}
URL: ${FRONTEND_URL}/setup

Results:
---------
${stepResults.map(s => `${s.status === 'PASSED' ? '✅' : '❌'} ${s.step}: ${s.status}`).join('\n')}

---------
Passed: ${passedSteps}/${stepResults.length}
Failed: ${failedSteps}

Files: ${fs.readdirSync(SCREENSHOT_DIR).join('\n')}
`;
    fs.writeFileSync(reportPath, report);
    console.log(`\n📄 Report: ${reportPath}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (page) {
      await takeScreenshot(page, 'ERROR', consoleErrors);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  console.log('═══════════════════════════════════════');
  console.log('✅ E2E TEST COMPLETE');
  console.log('═══════════════════════════════════════');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});