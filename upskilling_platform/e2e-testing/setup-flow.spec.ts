import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Setup Flow + Dashboard E2E Test', () => {
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      consoleErrors.push('Page Error: ' + error.message);
    });
  });

  test('should complete full setup flow and verify dashboard', async ({ page }) => {
    let screenshotNum = 0;
    
    // Reset database before starting test
    console.log('\n=== Resetting Database Before Test ===');
    try {
      execSync('python D:/PFE/upskilling_platform/reset_setup.py', { encoding: 'utf-8', stdio: 'pipe' });
      execSync('python D:/PFE/upskilling_platform/clear_users.py', { encoding: 'utf-8', stdio: 'pipe' });
      console.log('✓ Database reset complete\n');
    } catch (e) {
      console.log('Warning: Could not reset database, continuing anyway...');
    }
    
    async function captureScreenshot(name: string) {
      screenshotNum++;
      await page.screenshot({ path: `screenshot-${screenshotNum}-${name}.png`, fullPage: true });
      console.log(`Screenshot: screenshot-${screenshotNum}-${name}.png`);
    }

    console.log('\n=== Starting Setup Flow E2E Test ===\n');

    // ===== STEP 0: Welcome =====
    console.log('\n--- STEP 0: Welcome ---');
    await page.goto('http://localhost:3000/setup');
    await page.waitForTimeout(2000);
    
    console.log('URL: ' + page.url());
    console.log('Title: ' + await page.title());
    await captureScreenshot('welcome');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1500);
    console.log('Clicked Next');

    // ===== STEP 1: Admin Account =====
    console.log('\n--- STEP 1: Admin Account ---');
    console.log('URL: ' + page.url());
    await captureScreenshot('admin-account');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.fill('input[type="email"]', 'admin@skillforge.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.fill('input[placeholder="Admin"]', 'Super');
    await page.fill('input[placeholder="User"]', 'Admin');
    console.log('Filled admin form');
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1500);
    console.log('Clicked Next');

    // ===== STEP 2: Platform Config =====
    console.log('\n--- STEP 2: Platform Config ---');
    console.log('URL: ' + page.url());
    await captureScreenshot('platform-config');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.fill('input[placeholder="SkillForge"]', 'TestPlatform');
    await page.fill('input[placeholder="support@skillforge.io"]', 'support@testplatform.com');
    console.log('Filled platform config');
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1500);
    console.log('Clicked Next');

    // ===== STEP 3: Organization =====
    console.log('\n--- STEP 3: Organization ---');
    console.log('URL: ' + page.url());
    await captureScreenshot('organization');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.fill('input[placeholder="3S Group"]', 'Test Organization');
    await page.fill('input[placeholder="https://3sgroup.com"]', 'https://testorg.com');
    console.log('Filled organization');
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1500);
    console.log('Clicked Next');

    // ===== STEP 4: First Tenant (Skip) =====
    console.log('\n--- STEP 4: First Tenant ---');
    console.log('URL: ' + page.url());
    await captureScreenshot('first-tenant');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(1500);
    console.log('Clicked Next (skip tenant)');

    // ===== STEP 5: Review & Launch =====
    console.log('\n--- STEP 5: Review & Launch ---');
    console.log('URL: ' + page.url());
    await captureScreenshot('review-launch');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    await page.click('button:has-text("Launch Platform")');
    console.log('Clicked Launch Platform');

    // ===== WAIT FOR PLATFORM IS LIVE =====
    console.log('\n--- WAITING FOR PLATFORM IS LIVE ---');
    await page.waitForTimeout(3000);
    
    console.log('URL: ' + page.url());
    await captureScreenshot('platform-is-live');
    
    const platformLive = await page.getByText('Platform is live!').isVisible().catch(() => false);
    console.log('Platform is live! message visible: ' + platformLive);
    
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));

    // ===== REDIRECT TO LOGIN =====
    console.log('\n--- REDIRECT TO LOGIN ---');
    await page.waitForTimeout(2000);
    await page.waitForURL(/.*login|.*\/$/, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    console.log('URL after redirect: ' + page.url());
    await captureScreenshot('redirect-to-login');

    // ===== LOGIN PAGE =====
    console.log('\n--- LOGIN PAGE ---');
    console.log('URL: ' + page.url());
    console.log('Title: ' + await page.title());
    await captureScreenshot('login-page');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));

    // ===== LOGIN WITH ADMIN =====
    console.log('\n--- LOGIN WITH ADMIN ---');
    
    await page.fill('input[type="email"], input[type="text"]', 'admin@skillforge.io');
    await page.fill('input[type="password"]', 'TestPassword123!');
    console.log('Filled login credentials');
    
    await page.click('button:has-text("Login"), button:has-text("Sign In")');
    console.log('Clicked Login');
    
    await page.waitForTimeout(3000);
    
    console.log('URL after login: ' + page.url());
    await captureScreenshot('after-login');
    
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));

    // ===== DASHBOARD PAGE =====
    console.log('\n--- DASHBOARD PAGE ---');
    console.log('URL: ' + page.url());
    console.log('Title: ' + await page.title());
    await page.waitForTimeout(2000);
    await captureScreenshot('dashboard-page');
    
    // Check page content
    const bodyText = await page.locator('body').textContent();
    console.log('\n=== Dashboard Page Content ===');
    console.log('Page contains text: ' + (bodyText ? bodyText.substring(0, 500) + '...' : 'None'));
    
    // Check for key elements
    const dashboardText = await page.getByText('Dashboard').first().isVisible().catch(() => false);
    const welcomeText = await page.getByText(/Welcome/i).first().isVisible().catch(() => false);
    console.log('Dashboard text visible: ' + dashboardText);
    console.log('Welcome text visible: ' + welcomeText);
    
    // Check for navigation elements
    const sidebarLinks = await page.locator('nav a, aside a, [class*="sidebar"] a').count().catch(() => 0);
    console.log('Sidebar links count: ' + sidebarLinks);
    
    // Check for cards or statistics
    const cards = await page.locator('[class*="card"], .card, [class*="stat"]').count().catch(() => 0);
    console.log('Cards/Stats count: ' + cards);
    
    // Check for buttons
    const buttons = await page.locator('button').count();
    console.log('Buttons count: ' + buttons);
    
    console.log('\nConsole errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  ' + (i+1) + '. ' + e));
    }

    // ===== DASHBOARD SECTIONS =====
    console.log('\n=== TESTING ALL DASHBOARD SECTIONS ===\n');

    // Section 1: Dashboard Home
    console.log('\n--- SECTION 1: Dashboard Home ---');
    await page.waitForTimeout(1000);
    await captureScreenshot('section-1-dashboard-home');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));

    // Section 2: Companies/Tenants
    console.log('\n--- SECTION 2: Companies/Tenants ---');
    await page.goto('http://localhost:3000/superadmin/tenants');
    await page.waitForTimeout(2000);
    await captureScreenshot('section-2-companies');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Test Add Company
    console.log('\n--- Testing Add Company ---');
    await page.click('button:has-text("Add Company")');
    await page.waitForTimeout(1000);
    await captureScreenshot('add-company-modal');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Fill company form
    await page.locator('input').nth(0).fill('TestCompany');
    await page.locator('input[placeholder="e.g., techcorp"]').fill('testcompany');
    await captureScreenshot('company-form-filled');
    
    // Create company
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(3000);
    await captureScreenshot('after-add-company');
    
    // Verify company was added
    const newCompany = await page.getByText('TestCompany').first().isVisible();
    console.log('Company created: ' + newCompany);
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Test Edit Company
    console.log('\n--- Testing Edit Company ---');
    await page.click('text=Edit');
    await page.waitForTimeout(1500);
    await captureScreenshot('edit-company-modal');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Change company name
    const editNameInput = page.locator('input').nth(0);
    await editNameInput.clear();
    await editNameInput.fill('UpdatedCompany');
    await captureScreenshot('edit-company-form-filled');
    
    // Save changes
    await page.click('button:has-text("Save"), button:has-text("Update")');
    await page.waitForTimeout(2000);
    await captureScreenshot('after-edit-company');
    
    // Verify company was updated
    const updatedCompany = await page.getByText('UpdatedCompany').first().isVisible();
    console.log('Company updated: ' + updatedCompany);
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Test Platform Admins tab
    console.log('\n--- Testing Platform Admins Tab ---');
    await page.click('button:has-text("Platform Admins")');
    await page.waitForTimeout(1500);
    await captureScreenshot('platform-admins-tab');
    
    const adminUserCol = await page.getByText('Admin User').first().isVisible();
    console.log('Admin User column visible: ' + adminUserCol);
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    
    // Test Add Admin (Invite Tenant Admin)
    console.log('\n--- Testing Add Admin ---');
    const inviteBtn = page.locator('button:has-text("Invite Tenant Admin"), button:has-text("Invite Admin")');
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      await page.waitForTimeout(1500);
      await captureScreenshot('invite-admin-modal');
      console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
      
      // Fill invite form
      await page.locator('input').nth(0).fill('John');
      await page.locator('input').nth(1).fill('Doe');
      await page.locator('input[type="email"]').fill('john.doe@company.com');
      
      // Select company from dropdown
      const companySelect = page.locator('select').first();
      if (await companySelect.isVisible()) {
        await companySelect.selectOption({ index: 1 }); // Select first company
      }
      await captureScreenshot('invite-admin-filled');
      console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
      
      // Submit form - click the Send Invite button inside the modal
      // Wait for the button to be ready inside modal
      await page.waitForSelector('.fixed button:has-text("Send Invite")', { state: 'visible', timeout: 3000 });
      
      // Clear console errors before clicking
      consoleErrors.length = 0;
      console.log('Cleared console errors, clicking Send Invite...');
      
      await page.locator('.fixed button:has-text("Send Invite")').click();
      
      // Wait and capture any errors
      await page.waitForTimeout(3000);
      await captureScreenshot('after-invite-admin');
      
      console.log('Console errors after invite: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
      if (consoleErrors.length > 0) {
        consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
      }
      
      // Check if modal is still open (indicates failure)
      const modalStillOpen = await page.locator('.fixed button:has-text("Send Invite")').isVisible().catch(() => false);
      console.log('Modal still open (indicates error): ' + modalStillOpen);
      
      // Check for any error messages on page
      const errorText = await page.locator('body').textContent();
      if (errorText && (errorText.includes('error') || errorText.includes('Error') || errorText.includes('failed'))) {
        console.log('Page shows error message');
      }
    } else {
      console.log('Invite Admin button not visible');
    }

    // Section 3: Admins
    console.log('\n--- SECTION 3: Admins ---');
    await page.goto('http://localhost:3000/superadmin/admins');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-3-admins');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Section 4: Assign Admin
    console.log('\n--- SECTION 4: Assign Admin ---');
    await page.goto('http://localhost:3000/superadmin/admins/assign');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-4-assign-admin');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Section 5: Analytics
    console.log('\n--- SECTION 5: Analytics ---');
    await page.goto('http://localhost:3000/superadmin/analytics');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-5-analytics');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Section 6: Settings
    console.log('\n--- SECTION 6: Settings ---');
    await page.goto('http://localhost:3000/superadmin/settings');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-6-settings');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Section 7: Audit Log
    console.log('\n--- SECTION 7: Audit Log ---');
    await page.goto('http://localhost:3000/superadmin/audit');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-7-audit');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Section 8: Identity
    console.log('\n--- SECTION 8: Identity ---');
    await page.goto('http://localhost:3000/superadmin/identity');
    await page.waitForTimeout(1500);
    await captureScreenshot('section-8-identity');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // Go back to dashboard
    console.log('\n--- Returning to Dashboard ---');
    await page.goto('http://localhost:3000/superadmin');
    await page.waitForTimeout(1500);
    await captureScreenshot('back-to-dashboard');
    console.log('Console errors: ' + (consoleErrors.length > 0 ? consoleErrors.length : 'None'));
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((e, i) => console.log('  Error ' + (i+1) + ': ' + e));
    }

    // ===== FINAL RESULT =====
    console.log('\n=== TEST RESULT ===');
    if (consoleErrors.length > 0) {
      console.log('Total console errors: ' + consoleErrors.length);
      consoleErrors.forEach((e, i) => console.log('  ' + (i+1) + '. ' + e));
      console.log('❌ TEST FAILED');
    } else {
      console.log('✓ TEST PASSED - No console errors');
    }
    
    // Reset database after test
    console.log('\n=== Resetting Database ===');
    try {
      execSync('python D:/PFE/upskilling_platform/clean_database.py', { encoding: 'utf-8', stdio: 'pipe' });
      console.log('Database reset complete - platform is now clean for next use');
    } catch (e) {
      console.log('Error resetting database');
    }
  });
});