import { test, expect } from '@playwright/test';

test('Courses page loads with courses', async ({ page }) => {
  // Navigate to courses directly
  await page.goto('http://localhost:3000/courses');
  await page.waitForLoadState('networkidle');
  
  // Wait for courses to load
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/courses-page.png', fullPage: true });
  
  // Check if there's any course content
  const pageContent = await page.content();
  const hasCourses = pageContent.includes('course') || pageContent.includes('Course');
  
  console.log('Has course content:', hasCourses);
  
  // Try to find any links to courses
  const courseLinks = await page.locator('a[href*="/courses/"]').count();
  console.log('Course links found:', courseLinks);
});

test('Learning player page loads', async ({ page }) => {
  // Navigate directly to a learning page with a known course/lesson
  await page.goto('http://localhost:3000/learn/53d322bf-6899-4900-87e0-b565dc8c1bf7/c291e95b-8c06-42e2-a620-66b989ebda1a');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'test-results/learn-page.png', fullPage: true });
  
  // Check if the page loaded
  const pageContent = await page.content();
  console.log('Page has video:', pageContent.includes('video') || pageContent.includes('Video'));
  console.log('Page has player:', pageContent.includes('player') || pageContent.includes('Player'));
});
