const { chromium } = require("@playwright/test");
const path = require("path");

const baseUrl = process.env.BASE_URL || "http://localhost:3001";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputPath = path.resolve(
  __dirname,
  "..",
  "figures",
  "ch3_ai_recommendation_agent.png",
);

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

  await page.goto(`${baseUrl}/login?tenant=globalnet`, { waitUntil: "networkidle" });
  await page.locator("#email").fill("user1@globalnet.tn");
  await page.locator("#password").fill("user1@2026");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 });
  await page.goto(`${baseUrl}/recommendations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: /recommendations/i }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);

  const captureTarget = page.locator("main").first();
  if (await captureTarget.count()) {
    await captureTarget.screenshot({ path: outputPath });
  } else {
    await page.screenshot({ path: outputPath, fullPage: true });
  }

  await browser.close();
  console.log(`Saved recommendation agent figure to ${outputPath}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
