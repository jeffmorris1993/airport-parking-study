import { expect, type FrameLocator, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

export type Persona = 'owner' | 'renter' | 'dual' | 'none';

/** Screener answers that produce each persona under the prospectus rules. */
function screener(persona: Persona): Record<string, string> {
  return {
    'Are you 18': 'Yes',
    flown: 'Yes',
    'personal vehicle': persona === 'owner' || persona === 'dual' ? 'Yes' : 'No',
    license: 'Yes',
    'paid airport parking': persona === 'owner' || persona === 'dual' ? 'Yes, usually' : 'No, and I wouldn',
    'renting a car near an airport': persona === 'renter' || persona === 'dual' ? 'Business travel' : 'None of these',
  };
}

export async function consent(page: Page) {
  await page.goto('/?new=1');
  await page.getByText('I understand and agree').click();
  await page.getByRole('button', { name: 'Start the study' }).click();
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();
}

export async function answerSurvey(page: Page, persona: Persona) {
  const map = screener(persona);
  let n = 0;
  while (await page.getByText(/Question \d+ of \d+/).count()) {
    const h = (await page.locator('h1').first().innerText()).trim();
    const key = Object.keys(map).find((k) => h.includes(k));
    if (key) {
      const role = key === 'renting a car near an airport' ? 'checkbox' : 'radio';
      await page.getByRole(role, { name: new RegExp(map[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
    } else if (await page.locator('textarea').count()) {
      await page.locator('textarea').fill('Worried about damage and who is driving my car.');
    } else if (await page.locator('[role=listbox]').count()) {
      const picks = h.includes('three') ? 2 : 1;
      for (let i = 0; i < picks; i++) await page.locator('[role=listbox] button:not([disabled])').first().click();
    } else if (await page.locator('[role=checkbox]').count()) {
      await page.locator('[role=checkbox]').first().click();
    } else {
      await page.locator('[role=radio]').nth(1).click();
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    n++;
    expect(n).toBeLessThan(40);
  }
  return n;
}

/** Answer every checkpoint sheet that appears, waiting up to `waitMs` for the first one. */
export async function answerCheckpoints(page: Page, min = 1, waitMs = 4000) {
  const sheet = page.getByRole('dialog');
  const seen: string[] = [];
  await sheet.waitFor({ state: 'visible', timeout: waitMs }).catch(() => undefined);
  for (let i = 0; i < 8; i++) {
    if (!(await sheet.isVisible().catch(() => false))) {
      if (seen.length >= min) break;
      await page.waitForTimeout(600);
      continue;
    }
    seen.push(await sheet.locator('h2').first().innerText());
    const radios = sheet.getByRole('radio');
    if (await radios.count()) await radios.nth(Math.min(3, (await radios.count()) - 1)).click();
    else if (await sheet.locator('input[type=number]').count()) await sheet.locator('input[type=number]').first().fill('150');
    else await sheet.locator('textarea').first().fill('Not sure the insurance would cover me.');
    await sheet.getByRole('button', { name: 'Continue' }).click();
    await page.waitForTimeout(350);
  }
  expect(seen.length).toBeGreaterThanOrEqual(min);
  return seen;
}

const frame = (page: Page): FrameLocator => page.frameLocator('iframe');

async function sharedSteps(page: Page) {
  const f = frame(page);
  await f.locator('#continue').click();
  await answerCheckpoints(page);
  await f.locator('#email').fill('test@example.com');
  await f.locator('#phone').fill('3125550199');
  await f.locator('#pass').fill('password123');
  await f.locator('#submit').click();
  await answerCheckpoints(page);
  await f.locator('#startBtn').click();
  await f.getByText('Continue →').click({ timeout: 10_000 });
  await answerCheckpoints(page);
  await f.locator('#continue').click();
  await answerCheckpoints(page);
}

export async function ownerJourney(page: Page, first: boolean) {
  const f = frame(page);
  if (first) await sharedSteps(page);
  await f.locator('#continue').click();
  await answerCheckpoints(page);
  // A blocked link shows the toast and is logged, not followed.
  await f.getByText('Back to setup').first().click();
  await expect(page.getByText('That part isn’t included in this walkthrough.')).toBeVisible();
  await f.locator('#pay').click();
  await answerCheckpoints(page);
  await f.getByText('Next: add your vehicle').click({ timeout: 10_000 });
  for (const [k, v] of [['year', '2019'], ['make', 'Honda'], ['model', 'Accord'], ['color', 'Silver'], ['plate', 'DX 4471']]) {
    await f.locator(`#i-${k}`).fill(v);
  }
  await f.locator('#nextBtn').click();
  await expect(f.getByText('2019 Honda Accord')).toBeVisible();
  await f.locator('#rentSw').check();
  await f.locator('#price').fill('52');
  await f.locator('#go').click();
  await answerCheckpoints(page, 2);
  await expect(f.getByText('Your spot is reserved')).toBeVisible({ timeout: 10_000 });
  await answerCheckpoints(page, 2, 6000);
}

export async function renterJourney(page: Page, first: boolean) {
  const f = frame(page);
  if (first) await sharedSteps(page);
  await f.locator('a.cc').nth(2).click();
  await expect(f.getByText('2020 Honda Civic').first()).toBeVisible();
  // The prototype is always phone-width (full screen on mobile, a phone frame on desktop), so the sticky bar button is the one shown.
  await f.locator('#mbB').click();
  await answerCheckpoints(page);
  await f.locator('#continue').click();
  await answerCheckpoints(page);
  await f.locator('#agree').check();
  await f.locator('#go').click();
  await answerCheckpoints(page);
  await expect(f.locator('#done h2')).toHaveText('Request sent', { timeout: 10_000 });
  await answerCheckpoints(page, 2, 6000);
}

export async function finish(page: Page) {
  await page.getByText('No thanks').click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
}

/* ---------- reading what the server stored ---------- */

const DIR = '.data';
const json = <T>(f: string, d: T): T => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) : d);
export const stored = {
  participants: () => json<Record<string, unknown>[]>('participants.json', []),
  responses: () => json<Record<string, unknown>[]>('responses.json', []),
  events: () =>
    existsSync(`${DIR}/events.jsonl`)
      ? readFileSync(`${DIR}/events.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [],
  replays: () => json<Record<string, unknown>[]>('replay_chunks.json', []),
};

export async function participantCode(page: Page) {
  return (await page.locator('b.font-mono').innerText()).trim();
}
