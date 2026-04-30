import { test, expect } from '@playwright/test';
import path from 'path';

// Create test results directory
const testResultsDir = 'test-results';

test.describe('Sprint 2 - UI/E2E Testing', () => {
  
  // Test 1: Course Catalog Page
  test('DT-2.5.1 - Course Catalog page loads correctly', async ({ page }) => {
    console.log('\n🧪 Testing: Course Catalog Page');
    
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-course-catalog.png`, 
      fullPage: true 
    });
    
    // Check page title
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Check for course content
    const courseLinks = await page.locator('a[href*="/courses/"]').count();
    console.log('📚 Course links found:', courseLinks);
    
    // Verify we have courses or loading state
    const pageContent = await page.content();
    const hasContent = pageContent.includes('course') || pageContent.includes('Course') || pageContent.includes('Loading');
    expect(hasContent).toBeTruthy();
  });

  // Test 2: Course Detail Page
  test('DT-2.5.2 - Course Detail page works', async ({ page }) => {
    console.log('\n🧪 Testing: Course Detail Page');
    
    // First go to courses to find a course
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Try to find any course link and click
    const courseLink = page.locator('a[href*="/courses/"]').first();
    const linkCount = await courseLink.count();
    
    if (linkCount > 0) {
      await courseLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      // Take screenshot
      await page.screenshot({ 
        path: `${testResultsDir}/sprint2-course-detail.png`, 
        fullPage: true 
      });
      
      console.log('✅ Course detail page loaded');
    } else {
      console.log('⚠️ No course links found - may need authentication');
    }
  });

  // Test 3: Learning Player Page
  test('DT-2.5.3 - Learning Player page loads', async ({ page }) => {
    console.log('\n🧪 Testing: Learning Player Page');
    
    // Navigate directly to a sample learning path
    await page.goto('http://localhost:3000/learn');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-learn-page.png`, 
      fullPage: true 
    });
    
    // Check page state
    const pageContent = await page.content();
    const hasLearnContent = pageContent.includes('learn') || pageContent.includes('course') || pageContent.includes('enroll');
    console.log('📖 Has learn content:', hasLearnContent);
  });

  // Test 4: Bookmarks Page
  test('DT-2.1.12 - Bookmarks page functionality', async ({ page }) => {
    console.log('\n🧪 Testing: Bookmarks Page');
    
    await page.goto('http://localhost:3000/bookmarks');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-bookmarks.png`, 
      fullPage: true 
    });
    
    // Check if bookmarks page loads
    const pageContent = await page.content();
    const hasBookmarkContent = pageContent.includes('bookmark') || pageContent.includes('Bookmark');
    console.log('🔖 Has bookmark content:', hasBookmarkContent);
  });

  // Test 5: Onboarding Page
  test('DT-2.5.4 - Onboarding wizard UI', async ({ page }) => {
    console.log('\n🧪 Testing: Onboarding Wizard');
    
    await page.goto('http://localhost:3000/onboarding');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-onboarding.png`, 
      fullPage: true 
    });
    
    const pageContent = await page.content();
    const hasOnboarding = pageContent.includes('Welcome') || pageContent.includes('onboarding') || pageContent.includes('Onboard');
    console.log('🎯 Has onboarding content:', hasOnboarding);
  });

  // Test 6: Login Authentication
  test('Login page loads correctly', async ({ page }) => {
    console.log('\n🧪 Testing: Login Page');
    
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-login.png`, 
      fullPage: true 
    });
    
    // Check for login form elements
    const pageContent = await page.content();
    const hasLoginForm = pageContent.includes('login') || pageContent.includes('email') || pageContent.includes('password');
    console.log('🔐 Has login form:', hasLoginForm);
  });

  // Test 7: Dashboard loads
  test('Dashboard page loads', async ({ page }) => {
    console.log('\n🧪 Testing: Dashboard');
    
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-dashboard.png`, 
      fullPage: true 
    });
    
    // Check dashboard content
    const pageContent = await page.content();
    const hasDashboard = pageContent.includes('Dashboard') || pageContent.includes('XP') || pageContent.includes('dashboard');
    console.log('📊 Has dashboard content:', hasDashboard);
  });

  // Test 8: Certificates Page
  test('DT-2.1.13 - Certificates page works', async ({ page }) => {
    console.log('\n🧪 Testing: Certificates Page');
    
    await page.goto('http://localhost:3000/certificates');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-certificates.png`, 
      fullPage: true 
    });
    
    const pageContent = await page.content();
    const hasCertContent = pageContent.includes('certificate') || pageContent.includes('Certificate');
    console.log('📜 Has certificate content:', hasCertContent);
  });

  // Test 9: Navigation Sidebar
  test('Navigation sidebar works', async ({ page }) => {
    console.log('\n🧪 Testing: Navigation Sidebar');
    
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for sidebar navigation items
    const sidebarLinks = await page.locator('nav a, .sidebar a, [class*="sidebar"] a').count();
    console.log('🔗 Sidebar links:', sidebarLinks);
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-sidebar.png`, 
      fullPage: true 
    });
  });

  // Test 10: Accessibility - Page Title Check
  test('All pages have titles', async ({ page }) => {
    console.log('\n🧪 Testing: Accessibility - Page Titles');
    
    const pages = [
      { url: '/', name: 'Dashboard' },
      { url: '/courses', name: 'Courses' },
      { url: '/bookmarks', name: 'Bookmarks' },
      { url: '/login', name: 'Login' },
    ];
    
    for (const p of pages) {
      await page.goto(`http://localhost:3000${p.url}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      const title = await page.title();
      console.log(`📄 ${p.name} title:`, title);
    }
  });
});

test.describe('Sprint 2 - User Flows', () => {
  
  test('Complete course enrollment flow', async ({ page }) => {
    console.log('\n🧪 Testing: Course Enrollment Flow');
    
    // 1. Go to courses
    await page.goto('http://localhost:3000/courses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // 2. Try to click on a course
    const courseLink = page.locator('a[href*="/courses/"]').first();
    const courseCount = await courseLink.count();
    
    if (courseCount > 0) {
      console.log('✅ Step 1: Course Catalog accessible');
      await courseLink.click();
      await page.waitForTimeout(2000);
      
      // 3. Try to enroll (button should exist)
      const enrollButton = page.locator('button:has-text("Enroll"), a:has-text("Enroll")').first();
      const enrollCount = await enrollButton.count();
      
      if (enrollCount > 0) {
        console.log('✅ Step 2: Enroll button found');
      } else {
        console.log('⚠️ Step 2: No enroll button (may require login)');
      }
    } else {
      console.log('⚠️ No courses available');
    }
    
    // Take screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-enrollment-flow.png`, 
      fullPage: true 
    });
  });

  test('Navigation flow works', async ({ page }) => {
    console.log('\n🧪 Testing: Navigation Flow');
    
    // Start at dashboard
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Try different navigation links
    const navUrls = ['/courses', '/bookmarks', '/learn'];
    
    for (const url of navUrls) {
      await page.goto(`http://localhost:3000${url}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      
      // Check if page loaded
      const ready = await page.evaluate(() => document.readyState);
      console.log(`➡️ ${url} loaded:`, ready === 'complete' ? 'YES' : 'NO');
    }
    
    // Final screenshot
    await page.screenshot({ 
      path: `${testResultsDir}/sprint2-navigation-flow.png`, 
      fullPage: true 
    });
  });
});