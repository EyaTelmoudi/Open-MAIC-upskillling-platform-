# E2E Testing - Setup Flow

This folder contains End-to-End (E2E) tests for the SkillForge setup flow using Playwright.

## Test Coverage

The test covers the complete setup wizard flow:
1. **Welcome** - Initial welcome screen
2. **Admin Account** - Create super admin account (email, password, name)
3. **Platform Config** - Configure platform name, timezone, support email
4. **Organization** - Set organization name, website, brand color
5. **First Tenant** - Create first tenant (optional - skipped in test)
6. **Review & Launch** - Review configuration and launch platform

The test monitors:
- Console errors
- Console warnings
- Page errors
- Navigation flow
- Form submissions

## Prerequisites

1. Ensure the frontend is running on `http://localhost:3000`
2. Ensure the identity service is running on `http://localhost:8001`
3. Ensure PostgreSQL, RabbitMQ, and MinIO are running

## Installation

```bash
cd e2e-testing
npm install
```

## Running the Tests

### Run tests (headless mode)
```bash
npm test
```

### Run tests (headed mode - see browser)
```bash
npm run test:headed
```

### Run tests with Playwright UI
```bash
npm run test:ui
```

## Test Results

The test will output:
- ✓ TEST PASSED - If no console errors detected
- ❌ TEST FAILED - If console errors are found

Console errors will be listed with their messages.

## Files

- `setup-flow.spec.ts` - Main test file
- `playwright.config.ts` - Playwright configuration
- `package.json` - Dependencies