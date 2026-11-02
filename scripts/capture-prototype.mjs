import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "docs/architecture/prototype-screenshots");
const chromePath =
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : undefined);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(chromePath ? { executablePath: chromePath } : {}),
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(resolve(root, "index.html")).href);
  await page.waitForTimeout(2600);
  await page.screenshot({
    path: resolve(output, "dashboard.png"),
    fullPage: true,
  });
  await page.goto(pathToFileURL(resolve(root, "overlay.html")).href);
  await page.screenshot({
    path: resolve(output, "overlay.png"),
    fullPage: true,
    omitBackground: true,
  });
} finally {
  await browser.close();
}
console.log(`Saved prototype screenshots under ${output}`);
