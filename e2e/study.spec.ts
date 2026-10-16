import { expect, test } from '@playwright/test';
import { answerSurvey, consent, finish, ownerJourney, participantCode, renterJourney, stored } from './helpers';

async function waitForData(code: string) {
  // Events flush every few seconds and on page hide; give the last batch time to land.
  await expect
    .poll(() => stored.participants().find((p) => p.code === code)?.status, { timeout: 20_000 })
    .toBe('completed');
  return stored.participants().find((p) => p.code === code)! as { id: string; journey_order: string[] };
}

test('owner-only participant: survey, owner walkthrough, full tracking', async ({ page }) => {
  await consent(page);
  expect(await answerSurvey(page, 'owner')).toBe(18);
  await expect(page.getByText('Car owner')).toBeVisible();
  await page.getByRole('button', { name: 'Start the walkthrough' }).click();
  await ownerJourney(page, true);
  await finish(page);
  const code = await participantCode(page);
  const p = await waitForData(code);
  expect(p.journey_order).toEqual(['owner']);

  const rs = stored.responses().filter((r) => r.participant_id === p.id);
  const ids = new Set(rs.map((r) => `${r.question_id}${r.journey ? '@' + r.journey : ''}`));
  for (const q of ['s_age', 'q8_wtp', 'q9_concern', 'q_trip_length', 'cp1', 'cp2', 'cp3', 'cp4', 'cp5@owner', 'cp6@owner', 'h2_expect@owner', 'cp8@owner', 'cp9@owner', 'cp10@owner']) {
    expect(ids, q).toContain(q);
  }
  const trip = rs.find((r) => r.question_id === 'owner.trip:confirmed')!.value as { rent: boolean; price: number };
  expect(trip.rent).toBe(true);
  expect(trip.price).toBe(52);
  const vehicle = rs.find((r) => r.question_id === 'owner.vehicle:vehicle')!.value as Record<string, string>;
  expect(vehicle.make).toBe('Honda');
  expect(vehicle).not.toHaveProperty('plate');

  await expect.poll(() => stored.events().filter((e) => e.participant_id === p.id && e.type === 'step_exit' && e.step_id === 'owner.trip').length, { timeout: 15_000 }).toBeGreaterThan(0);
  const ev = stored.events().filter((e) => e.participant_id === p.id);
  const exits = ev.filter((e) => e.type === 'step_exit' && String(e.step_id).startsWith('owner.') && e.meta.outcome === 'advanced');
  expect(exits.length).toBeGreaterThanOrEqual(8);
  for (const e of exits) expect(e.meta.duration_ms, e.step_id).toBeGreaterThan(0);
  expect(ev.some((e) => e.type === 'blocked_nav')).toBe(true);
  expect(ev.some((e) => e.type === 'click' && e.meta?.surface === 'screen' && e.x != null)).toBe(true);
  // Free text is never logged; only its length.
  expect(JSON.stringify(ev)).not.toContain('test@example.com');
  expect(JSON.stringify(ev)).not.toContain('password123');
  await expect.poll(() => stored.replays().filter((c) => c.participant_id === p.id).length, { timeout: 20_000 }).toBeGreaterThan(0);
});

test('renter-only participant', async ({ page }) => {
  await consent(page);
  await answerSurvey(page, 'renter');
  await expect(page.getByText('Traveler renting a car')).toBeVisible();
  await page.getByRole('button', { name: 'Start the walkthrough' }).click();
  await renterJourney(page, true);
  await finish(page);
  const p = await waitForData(await participantCode(page));
  const rs = stored.responses().filter((r) => r.participant_id === p.id);
  expect(rs.some((r) => r.question_id === 'cp7' && r.journey === 'renter')).toBe(true);
  expect((rs.find((r) => r.question_id === 'renter.car:request')!.value as { car: string }).car).toBe('2020 Honda Civic');
});

test('dual participant sees both journeys and skips shared steps the second time', async ({ page }) => {
  await consent(page);
  await answerSurvey(page, 'dual');
  const order: string[] = [];
  for (let i = 0; i < 2; i++) {
    const label = page.getByText(new RegExp(`Walkthrough ${i + 1} of 2`));
    await expect(label).toBeVisible();
    const owner = ((await label.textContent()) || '').includes('Car owner');
    order.push(owner ? 'owner' : 'renter');
    await page.getByRole('button', { name: 'Start the walkthrough' }).click();
    if (owner) await ownerJourney(page, i === 0);
    else await renterJourney(page, i === 0);
  }
  await finish(page);
  const p = await waitForData(await participantCode(page));
  expect(p.journey_order).toEqual(order);
  const second = order[1];
  const ev = stored.events().filter((e) => e.participant_id === p.id && e.type === 'step_enter');
  expect(ev.some((e) => e.step_id === `${second}.signup`)).toBe(false);
});

test('screened out: answers kept, no walkthrough', async ({ page }) => {
  await consent(page);
  await answerSurvey(page, 'none');
  await expect(page.getByText('you’re all done')).toBeVisible();
  await expect.poll(() => stored.participants().some((p) => p.status === 'screened_out' && p.screen_out_reason === 'no_persona_match'), { timeout: 15_000 }).toBe(true);
});

test('under 18 stops immediately', async ({ page }) => {
  await consent(page);
  await page.getByRole('radio', { name: 'No' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('only open to people 18 and older')).toBeVisible();
});

test('admin pages render with data', async ({ page }) => {
  for (const path of ['/admin', '/admin/survey', '/admin/survey?split=persona', '/admin/journey', '/admin/checkpoints', '/admin/heatmaps', '/admin/participants', '/admin/interviews', '/admin/export']) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
  }
  const csv = await page.request.get('/admin/export/responses_wide');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('q8_wtp');
});
