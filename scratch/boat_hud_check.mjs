import { chromium } from 'playwright';
import path from 'node:path';

const filePath = 'file://' + path.resolve('/home/Luster/SimPjoa/dist/simulator_standalone.html');

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto(filePath);
await page.waitForTimeout(1000);

console.log('HUD boat text on load:', await page.locator('#hudBoat').textContent());

await page.click('#btnBoat');
await page.waitForTimeout(300);
console.log('Boat dropdown value on open:', await page.locator('#boatVariant').inputValue());
console.log('Default option label text:', await page.locator('#boatVariant option[value="default"]').textContent());
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/boat_hud_1_boatpanel.png' });

await page.selectOption('#boatVariant', 'default');
await page.click('#btnApplyBoat');
await page.waitForTimeout(300);
await page.click('#btnCloseBoat');
await page.waitForTimeout(300);
console.log('HUD boat text after switching to default (PJOA v2):', await page.locator('#hudBoat').textContent());
await page.screenshot({ path: '/tmp/claude-1000/-home-Luster-SimPjoa/dd156eed-1cfa-4f43-bad1-8a86447d04b4/scratchpad/boat_hud_2_afterv2.png' });

console.log('CONSOLE ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
