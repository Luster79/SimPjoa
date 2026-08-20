import { chromium } from 'playwright';
import path from 'node:path';

const target = process.argv[2] || 'dist/simulator_standalone.html';
const filePath = target.startsWith('http') ? target : 'file://' + path.resolve('/home/Luster/SimPjoa/' + target);
console.log('testing:', filePath);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.goto(filePath);
await page.waitForTimeout(1000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake_1_initial.png' });

const checked = await page.locator('#wakeTrail').isChecked().catch(() => 'MISSING');
console.log('wakeTrail checkbox checked (before):', checked);

// Enable it explicitly, matching what a user would do
await page.locator('#wakeTrail').check();
console.log('wakeTrail checkbox checked (after check()):', await page.locator('#wakeTrail').isChecked());

await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake_2_after5s.png' });

// Now switch to PJOA Slim via the Boat tab, apply, and see if wake resumes
await page.click('#btnBoat');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake_3_boatpanel.png' });
await page.selectOption('#boatVariant', 'slim').catch((e) => console.log('selectOption error:', e.message));
await page.waitForTimeout(300);
await page.click('#btnApplyBoat').catch((e) => console.log('apply click error:', e.message));
await page.waitForTimeout(300);
await page.click('#btnForces').catch(() => {});
console.log('wakeTrail checkbox checked (after boat switch):', await page.locator('#wakeTrail').isChecked());
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/wake_4_after_slim.png' });

console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));

await browser.close();
