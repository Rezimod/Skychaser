// Plays through Stellar Academy on a phone-sized window: onboarding, one
// lesson start to finish (answering whatever comes first, so misses and the
// retry path run too), the capsule, the cards and the parents' area.
// Usage: node scripts/qa-academy.mjs [baseUrl] [outDir]
import { chromium, devices } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? '.';
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (n) => { await page.waitForTimeout(450); return page.screenshot({ path: `${out}/${n}.png`, fullPage: false }); };

await page.goto(`${base}/academy`, { waitUntil: 'networkidle' });
await page.locator('.ac-onboard').waitFor();
await shot('01-onboarding');
await page.fill('.ac-input', 'Nino');
await page.locator('.ac-avatar').nth(1).click();
await page.locator('.ac-seg__btn', { hasText: '6-9' }).click();
await page.locator('button[type=submit]').click();
await page.locator('.ac-home').waitFor();
await shot('02-home');

await page.locator('.ac-node[data-current=true] .ac-node__btn').click();
await page.locator('.ac-intro').waitFor();
await page.waitForTimeout(400);
await shot('03-intro');
await page.waitForTimeout(400);
await page.locator('.ac-intro .ac-btn--primary').click();
await page.locator('.ac-lesson').waitFor();

let steps = 0;
const kinds = new Set();
while (await page.locator('.ac-lesson').count() && steps < 40) {
  steps++;
  const kind = await page.locator('.ac-ex').getAttribute('data-kind');
  kinds.add(kind);
  if (kind === 'choice' || kind === 'truefalse') await page.locator('.ac-choice').first().click();
  else if (kind === 'order') {
    const n = await page.locator('.ac-order__pool .ac-chip').count();
    for (let i = 0; i < n; i++) await page.locator('.ac-order__pool .ac-chip:not([disabled])').first().click();
  } else if (kind === 'match') {
    const n = await page.locator('.ac-match__col').first().locator('.ac-chip').count();
    for (let i = 0; i < n; i++) {
      await page.locator('.ac-match__col').nth(0).locator('.ac-chip').nth(i).click();
      await page.locator('.ac-match__col').nth(1).locator('.ac-chip:not([data-paired=true])').first().click();
    }
  }
  if (!kinds.has(`shot-${kind}`)) { kinds.add(`shot-${kind}`); await shot(`04-ex-${kind}`); }
  await page.locator('.ac-lesson__foot .ac-btn--primary:not([disabled])').click();
  await page.locator('.ac-feedback').waitFor();
  if (steps === 1 || steps === 3) await shot(`05-feedback-${steps}`);
  await page.locator('.ac-lesson__foot .ac-btn').click();
  await page.waitForTimeout(80);
}
await page.locator('.ac-result').waitFor();
await shot('06-result');
await page.locator('.ac-capsule .ac-btn--gold').click();
await page.locator('.ac-reveal').waitFor();
await page.waitForTimeout(700);
await shot('07-card');
await page.locator('.ac-reveal .ac-btn--primary').click();
const missionHref = await page.locator('.ac-mission a').getAttribute('href');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stellar_academy_v1')));

await page.locator('.ac-result .ac-btn--ghost').click();
await page.locator('.ac-home').waitFor();
await shot('08-home-after');
await page.locator('.ac-tab').nth(1).click();
await page.locator('.ac-cards').waitFor();
await shot('09-cards');
await page.locator('.ac-tab').nth(2).click();
const q = await page.locator('.ac-gate .ac-field__label').innerText();
const [a, b] = q.match(/(\d+)\s*×\s*(\d+)/).slice(1).map(Number);
await page.fill('.ac-input', '1');
await page.locator('.ac-gate button[type=submit]').click();
const wrongShown = await page.locator('.ac-error').count();
await page.fill('.ac-input', String(a * b));
await page.locator('.ac-gate button[type=submit]').click();
await page.locator('.ac-parents').waitFor();
await shot('10-parents');

// The game's mission gate, as the game would ask it.
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({
  steps, kinds: [...kinds].filter((k) => !k.startsWith('shot')), missionHref,
  moon1: stored.lessons['moon-1'], xp: stored.xp, cards: stored.cards, capsules: stored.capsules, kidsMode: stored.kidsMode,
  streak: stored.streak, wrongShown, overflow, errors,
}, null, 1));
await browser.close();
