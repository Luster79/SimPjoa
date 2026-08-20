import { chromium } from 'playwright';
import path from 'node:path';

const filePath = 'file://' + path.resolve('/home/Luster/SimPjoa/dist/simulator_standalone.html');

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('pageerror:', err.message));

await page.goto(filePath);
await page.waitForTimeout(500);

// Enable wake trail immediately (fresh, empty buffer)
await page.locator('#wakeTrail').check();

// Go straight to the Boat panel (freezes sim per the code read)
await page.click('#btnBoat');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake5_boatmode_t0.png' });

await page.waitForTimeout(5000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake5_boatmode_t5.png' });

// Apply PJOA Slim (resets boat + wake), THEN return to sailing view via the
// panel's own "Back to sailing" button (btnCloseBoat), matching what a user
// clicking around the new Slim/Fat options would actually do.
await page.selectOption('#boatVariant', 'slim');
await page.click('#btnApplyBoat');
await page.waitForTimeout(300);
await page.click('#btnCloseBoat');
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake5_backtoforces_t0.png' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake5_backtoforces_t3.png' });
await page.waitForTimeout(7000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake5_backtoforces_t10.png' });

await browser.close();
