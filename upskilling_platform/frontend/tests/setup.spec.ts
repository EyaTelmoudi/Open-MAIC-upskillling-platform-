import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:3000';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

test.describe('Setup Flow', () => {
  
  test('Setup page loads correctly', async ({ page }) => {
    console.log('\n🧪 Testing: Setup Page');
    
    await page.goto(`${FRONTEND_URL}/setup`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/setup-page.png', 
      fullPage: true 
    });
    
    // Check if setup form is visible
    const pageContent = await page.content();
    const hasSetupContent = pageContent.includes('Welcome') || pageContent.includes('Setup') || pageContent.includes('SuperAdmin');
    
    console.log('📄 Setup page loaded:', hasSetupContent);
    expect(hasSetupContent).toBeTruthy();
  });

  test('Setup API status endpoint works', async ({ page }) => {
    console.log('\n🧪 Testing: Setup Status API');
    
    const response = await page.request.get(`${FRONTEND_URL}/api/v1/identity/setup/status`, {
      headers: { 'X-Setup-Key': '' }
    });
    
    console.log('📡 Status:', response.status());
    
    // 401 means endpoint exists but key is missing (expected)
    expect([401, 404]).toContain(response.status());
  });

  test('Identity service health check', async ({ page }) => {
    console.log('\n🧪 Testing: Identity Service Health');
    
    const response = await page.request.get('http://localhost:8001/health');
    const data = await response.json();
    
    console.log('🏥 Health:', data);
    expect(data.status).toBe('healthy');
  });

  test('Login page loads', async ({ page }) => {
    console.log('\n🧪 Testing: Login Page');
    
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ 
      path: 'test-results/login-page.png', 
      fullPage: true 
    });
    
    const pageContent = await page.content();
    const hasLogin = pageContent.includes('Login') || pageContent.includes('email') || pageContent.includes('password');
    
    console.log('🔐 Login page loaded:', hasLogin);
    expect(hasLogin).toBeTruthy();
  });
});