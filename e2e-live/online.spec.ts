import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { chooseBotAction, getCurrentActor } from '../src/game/engine';
import { applyRoomUpdate } from '../src/lib/room-wire';
import type { OnlineRoom } from '../src/lib/online';
const project = JSON.parse(readFileSync('src/lib/supabase-public.json', 'utf8')) as { url: string; publishableKey: string };

test.skip(process.env.AQUIRE_LIVE_TEST !== '1', 'Set AQUIRE_LIVE_TEST=1 to exercise hosted Supabase.');
const env = loadEnv('production', process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL || project.url;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || project.publishableKey;

function recordIds(file: string, ids: string[]) {
  mkdirSync('artifacts/online-review', { recursive: true });
  const path = `artifacts/online-review/${file}`;
  const previous: string[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
  writeFileSync(path, JSON.stringify([...new Set([...previous, ...ids])]));
}

async function call(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async ({ url, key, body }) => {
    const session = JSON.parse(localStorage.getItem('aquire.online.auth')!);
    const response = await fetch(`${url}/functions/v1/acquire-room`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }, { url, key, body });
}
async function openOnline(page: Page) {
  await page.getByRole('button', { name: /Across the city/ }).click();
}
async function dismissRecaps(page: Page) {
  for (let i = 0; i < 20; i++) {
    const recap = page.getByTestId('turn-recap');
    if (!(await recap.isVisible())) return;
    await recap.getByRole('button', { name: /Continue|Next|Back to/i }).click();
  }
}

test('real guests create, join, play, reconnect and close a private table', async ({ browser }) => {
  const fullMatch = process.env.AQUIRE_LIVE_FULL_MATCH === '1';
  if (fullMatch) test.setTimeout(600000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ viewport: { width: 393, height: 740 }, isMobile: true, hasTouch: true })]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host, guest] = pages;
  const latest = new Map<Page, OnlineRoom>();
  const getCalls = new Map<Page, number>(pages.map((page) => [page, 0]));
  const notifications = new Map<Page, number>(pages.map((page) => [page, 0]));
  const subscribed = new Set<Page>();
  const userIds = new Set<string>();
  const errors: string[] = [];
  const realtimeFrames: string[] = [];
  let code: string | undefined;
  function recordRoom(page: Page, data: any) {
    const previous = latest.get(page);
    if (data?.kind === 'snapshot') data = data.room;
    else if (data?.kind === 'patch') data = previous ? applyRoomUpdate(previous, data) : null;
    if (data?.viewerId && data?.code && (!previous || previous.version <= data.version)) {
      latest.set(page, data); userIds.add(data.viewerId);
    }
  }
  for (const page of pages) {
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/acquire-room') && request.method() === 'POST' && request.postDataJSON()?.operation === 'get')
        getCalls.set(page, getCalls.get(page)! + 1);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
      realtimeFrames.push(String(payload));
      if (String(payload).includes('"postgres_changes":[]') && String(payload).includes('"status":"ok"')) subscribed.add(page);
      const frame = JSON.parse(String(payload));
      const event = Array.isArray(frame) ? frame[4] : frame.payload;
      if (event?.event === 'state') {
        notifications.set(page, notifications.get(page)! + 1);
        recordRoom(page, event.payload);
      }
    }));
    page.on('response', async (response) => {
      if (response.url().includes('/auth/v1/signup') && response.ok()) {
        const data = await response.json().catch(() => null);
        if (data?.user?.id) { userIds.add(data.user.id); recordIds('test-user-ids.json', [data.user.id]); }
      }
      if (!response.url().includes('/functions/v1/acquire-room') || response.request().method() !== 'POST' || !response.ok()) return;
      const data = await response.json().catch(() => null);
      recordRoom(page, data);
    });
  }
  try {
    await Promise.all(pages.map((page) => page.goto('/')));
    await openOnline(host);
    await expect(host.getByText('Online tables aren’t connected yet.')).toHaveCount(0);
    await host.getByLabel('Your name', { exact: true }).fill('Live test host');
    await host.getByRole('button', { name: 'Open your table' }).click();
    await expect(host.locator('.room-code span')).toBeVisible();
    code = (await host.locator('.room-code span').innerText()).trim();
    await expect.poll(() => latest.get(host)?.features).toContain('room-deltas-v1');
    await expect.poll(() => subscribed.has(host)).toBe(true);

    await openOnline(guest);
    await guest.getByRole('button', { name: 'Join friends', exact: true }).click();
    await guest.getByLabel('Your name', { exact: true }).fill('Live test guest');
    await guest.getByLabel('Room code', { exact: true }).fill(code);
    await guest.getByRole('button', { name: 'Take your seat' }).click();
    await expect.poll(() => subscribed.has(guest)).toBe(true);
    await expect(host.locator('.lobby-players')).toContainText('Live test guest');
    await expect.poll(() => notifications.get(host)).toBeGreaterThan(0);
    expect(latest.get(host)!.viewerId).not.toBe(latest.get(guest)!.viewerId);

    // A seated opponent cannot listen to another player's private updates or
    // publish forged state changes, even if they know the room and user IDs.
    const guestToken = await guest.evaluate(() => JSON.parse(localStorage.getItem('aquire.online.auth')!).access_token as string);
    const probe = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      await probe.realtime.setAuth(guestToken);
      const blocked = probe.channel(`acquire:${latest.get(host)!.id}:${latest.get(host)!.viewerId}`, { config: { private: true } });
      const status = await new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('TIMEOUT'), 12000);
        blocked.subscribe((state) => {
          if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') { clearTimeout(timer); resolve(state); }
        });
      });
      expect(status).toBe('CHANNEL_ERROR');
      const forged = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${guestToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: `acquire:${latest.get(guest)!.id}:${latest.get(guest)!.viewerId}`,
          event: 'state', private: true, payload: { forged: true } }] }),
      });
      // The batch API acknowledges even when RLS silently drops a message.
      // Check actual delivery below, after legitimate traffic has arrived.
      expect([202, 403]).toContain(forged.status);
      await forged.body?.cancel();
    } finally { await probe.removeAllChannels(); }

    // Room version checks transfer a tiny response and do not write a new row.
    const lobby = latest.get(host)!;
    const unchanged = await call(host, { operation: 'get', code, knownVersion: lobby.version });
    expect(unchanged.data).toEqual({ unchanged: true, version: lobby.version });
    expect(JSON.stringify(unchanged.data).length).toBeLessThan(60);

    await host.getByLabel('Invite the house').selectOption('1');
    if (fullMatch) {
      await host.getByLabel('Computer difficulty').selectOption('strategist');
      await host.getByLabel('Market fluctuation').selectOption('crazy');
      await host.getByLabel('Round-end dividends').check();
    }
    await host.getByRole('button', { name: 'Start the game' }).click();
    await expect.poll(() => latest.get(guest)?.status).toBe('playing');
    await expect.poll(() => notifications.get(guest)).toBeGreaterThan(0);
    expect(realtimeFrames.some((frame) => frame.includes('"forged":true'))).toBe(false);

    for (const page of pages) {
      const room = latest.get(page)!;
      expect(room.game!.bag.every((tile) => tile === '?')).toBe(true);
      for (const player of room.game!.players) {
        expect(player.hand.every((tile) => tile === '?')).toBe(player.id !== room.viewerId);
      }
      expect(room.game!.seed).toBe(0);
      expect(room.game!.rng).toBe(0);
    }

    // Play an actual rack tile through the UI, then exercise several full turns
    // through the same authenticated command endpoint, including computer play.
    let state = latest.get(host)!.game!;
    const firstActor = getCurrentActor(state);
    const activePage = pages.find((page) => latest.get(page)!.viewerId === firstActor.id)!;
    const otherPage = pages.find((page) => page !== activePage)!;
    const rejected = await call(otherPage, { operation: 'action', code, expectedVersion: latest.get(activePage)!.version, action: { type: 'buy', stocks: {} } });
    expect(rejected.status).toBe(403);
    await dismissRecaps(activePage);
    const observerGets = getCalls.get(otherPage)!;
    const moveVersion = latest.get(activePage)!.version;
    await activePage.locator('.tile-rack .rack-tile:not(:disabled)').first().click();
    await activePage.getByRole('button', { name: /^Place \d+[A-Z]$/ }).click();
    await expect.poll(() => latest.get(activePage)?.version).toBeGreaterThan(moveVersion);
    await expect.poll(() => latest.get(otherPage)?.version).toBeGreaterThan(moveVersion);
    expect(getCalls.get(otherPage)).toBe(observerGets); // The move arrived without a fetch.

    let merged = false;
    let room = (await call(activePage, { operation: 'get', code })).data as OnlineRoom;
    for (let i = 0; i < (fullMatch ? 600 : 10); i++) {
      state = room.game!;
      if (state.phase === 'ended') break;
      if (state.merger) merged = true;
      const actor = getCurrentActor(state);
      const actorPage = pages.find((page) => latest.get(page)!.viewerId === actor.id)!;
      expect(actorPage).toBeTruthy();
      await expect.poll(() => latest.get(actorPage)?.version).toBeGreaterThanOrEqual(room.version);
      const view = latest.get(actorPage)!;
      const action = chooseBotAction(view.game!);
      const result = await call(actorPage, { operation: 'action', code, expectedVersion: view.version,
        sync: 'delta-v1', knownVersion: view.version, action });
      expect(result.status, JSON.stringify(result.data)).toBe(200);
      room = result.data.kind ? applyRoomUpdate(view, result.data)! : result.data;
      expect(room).toBeTruthy();
      await expect.poll(() => latest.get(pages.find((page) => page !== actorPage)!)?.version).toBeGreaterThanOrEqual(room.version);
    }
    const before = (await call(guest, { operation: 'get', code })).data as OnlineRoom;
    await guest.reload();
    await openOnline(guest);
    await expect(guest.locator('.room-code')).toContainText(code);
    await guest.getByRole('button', { name: 'Return to your game' }).click();
    expect(latest.get(guest)!.viewerId).toBe(before.viewerId);
    expect(latest.get(guest)!.game!.players.find((player) => player.id === before.viewerId)!.hand)
      .toEqual(before.game!.players.find((player) => player.id === before.viewerId)!.hand);
    await expect(guest.locator(fullMatch ? '.finale' : '.game-screen')).toBeVisible();
    await guest.screenshot({ path: 'artifacts/online-review/live-mobile-table.png', animations: 'disabled' });
    if (fullMatch) {
      expect(room.game!.phase).toBe('ended');
      expect(merged).toBe(true);
      expect(room.game!.results).toHaveLength(3);
      expect(room.game!.finalSettlements!.length).toBeGreaterThan(0);
      expect(room.game!.logs.some((entry) => entry.payout)).toBe(true);
      for (const settlement of room.game!.finalSettlements!) {
        expect(settlement.marketDie).toBeGreaterThanOrEqual(1);
        expect(settlement.marketDie).toBeLessThanOrEqual(6);
        expect(settlement.marketShift).toBe([-2, -1, 0, 0, 1, 2][settlement.marketDie! - 1]);
      }
      await guest.getByRole('button', { name: /^Roll for/ }).click();
      const fastReveal = guest.getByRole('button', { name: 'Show result', exact: true });
      if (await fastReveal.isVisible()) await fastReveal.click();
      await expect(guest.locator('.final-market-result .dice-face')).toHaveText(String(room.game!.finalSettlements![0].marketDie));
      const history = (await call(guest, { operation: 'history' })).data;
      expect(history.some((match: { id: string }) => match.id === room.id)).toBe(true);
      expect(errors).toEqual([]);
      return;
    }
    const forbidden = await call(guest, { operation: 'end', code });
    expect(forbidden.status).toBe(403);
    const closed = await call(host, { operation: 'end', code });
    expect(closed.status).toBe(200);
    await expect.poll(() => guest.evaluate(() => localStorage.getItem('aquire.room'))).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    if (code) await call(host, { operation: 'end', code }).catch(() => undefined);
    mkdirSync('artifacts/online-review', { recursive: true });
    recordIds('test-user-ids.json', [...userIds]);
    recordIds('test-room-ids.json', [...latest.values()].map((value) => value.id));
    writeFileSync('artifacts/online-review/realtime-frames.json', JSON.stringify(realtimeFrames, null, 2));
    await Promise.all(contexts.map((context) => context.close()));
  }
});
