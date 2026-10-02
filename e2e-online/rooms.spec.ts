/**
 * Browser integration against mocked Supabase HTTP responses. These tests verify
 * UI/auth-client/polling contracts, not live Edge Functions, RLS or deployment.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import {
  ALL_TILES,
  CHAINS,
  applyAction,
  createGame,
  analyzeTile,
  type GameAction,
  type GameState,
} from '../src/game/engine';
import { getMap } from '../src/game/maps';
import { DEFAULT_AVATAR, encodeAvatar } from '../src/game/avatars';
import type { LobbyOptions, OnlineProfile, OnlineRoom } from '../src/lib/online';
import type { HouseRules, MapId } from '../src/game/types';

const HOST = '11111111-1111-4111-8111-111111111111';
const GUEST = '22222222-2222-4222-8222-222222222222';
const CODE = 'CITY42';

class MockSupabase {
  room: OnlineRoom;
  fullGame: GameState | null = null;
  operations: Record<string, unknown>[] = [];
  closed = false;
  authCalls = 0;
  profile: OnlineProfile = { id: HOST, name: 'Alex', avatar: null, country: 'US', storyWins: 0, games: 4, wins: 1, ties: 1, placementSum: 9, podiums: 3, bestFinish: 1, bestScore: 25400 };
  holdNextPoll = false;
  heldPoll: { route: Route; snapshot: OnlineRoom } | null = null;
  constructor(readonly viewerId = HOST) {
    this.room = {
      id: 'mock-room-1',
      code: CODE,
      hostId: HOST,
      ruleset: '2008',
      mode: 'classic',
      status: 'lobby',
      version: 1,
      players: [
        { id: HOST, name: 'Alex', isBot: false },
        ...(viewerId === GUEST ? [{ id: GUEST, name: 'Morgan', isBot: false }] : []),
      ],
      game: null,
      viewerId,
      updatedAt: new Date().toISOString(),
      features: ['profiles-v1', 'public-lobbies-v1', 'avatars-v2', 'maps-v1', 'large-maps-v1', 'shaped-maps-v2', 'shaped-maps-v3', 'small-tables-v1', 'difficulty-v1', 'match-history-v1', 'house-rules-v1', 'hotel-roster-v1', 'hotel-stock-v1', 'market-frequency-v1'],
    };
  }
  snapshot(): OnlineRoom {
    const room = structuredClone(this.room);
    if (this.fullGame) {
      room.game = structuredClone(this.fullGame);
      room.game.bag = room.game.bag.map(() => '?');
      room.game.seed = 0;
      room.game.rng = 0;
      room.game.players.forEach((player) => {
        if (player.id !== this.viewerId) player.hand = player.hand.map(() => '?');
      });
    }
    return room;
  }
  start(options: { botCount?: number; mapId?: MapId; botDifficulty?: 'standard' | 'strategist'; houseRules?: HouseRules } = {}) {
    if (this.room.players.length === 1)
      this.room.players.push({ id: GUEST, name: 'Morgan', isBot: false });
    if (this.room.players.length === 2 && options.botCount !== 0 && getMap(options.mapId).maxPlayers > 2)
      this.room.players.push({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Jordan',
        isBot: false,
      });
    this.fullGame = createGame({
      id: 'mock-online-game',
      seed: 42,
      players: this.room.players,
      mode: this.room.mode,
      mapId: options.mapId,
      botDifficulty: options.botDifficulty,
      houseRules: options.houseRules,
    });
    this.fullGame.currentPlayer = 0;
    this.room.status = 'playing';
    this.room.version++;
  }
  finish() {
    this.start();
    this.fullGame!.phase = 'ended';
    this.fullGame!.endReason = 'The final turn is complete.';
    this.fullGame!.results = this.fullGame!.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      cashBefore: 6000,
      bonuses: index === 0 ? 5000 : 2000,
      stocksValue: 0,
      total: index === 0 ? 11000 : 8000,
      rank: index + 1,
    }));
    this.fullGame!.players.forEach((player, index) => {
      player.cash = this.fullGame!.results[index].total;
    });
    this.fullGame!.winnerIds = [HOST];
    this.room.status = 'finished';
    this.room.version++;
  }
  async respond(route: Route, body: unknown, status = 200) {
    await route.fulfill({
      status,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      },
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  }
  async releasePoll() {
    const held = this.heldPoll;
    this.heldPoll = null;
    if (held) await this.respond(held.route, held.snapshot);
  }
  async install(page: Page) {
    await page.route('http://127.0.0.1:54321/**', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return this.respond(route, {});
      const url = new URL(request.url());
      if (url.pathname.startsWith('/auth/v1/')) {
        this.authCalls++;
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const user = {
          id: this.viewerId,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
          user_metadata: {},
          created_at: new Date().toISOString(),
          is_anonymous: true,
        };
        const encode = (data: object) => Buffer.from(JSON.stringify(data)).toString('base64url');
        const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: this.viewerId, exp: expires, role: 'authenticated' })}.http-mocked-signature`;
        return this.respond(
          route,
          url.pathname.endsWith('/user')
            ? user
            : {
                access_token: token,
                refresh_token: 'http-mocked-refresh-token',
                token_type: 'bearer',
                expires_in: 3600,
                expires_at: expires,
                user,
              },
        );
      }
      if (url.pathname !== '/functions/v1/acquire-room')
        throw new Error(`Unexpected mocked request: ${url.pathname}`);
      const body = request.postDataJSON() as {
        operation: string;
        action?: GameAction;
        name?: string;
        avatar?: string;
        country?: string;
        storyWins?: number;
        visibility?: 'private' | 'public';
        options?: LobbyOptions;
        expectedVersion?: number;
        mapId?: MapId;
        botCount?: number;
        houseRules?: HouseRules;
        botDifficulty?: 'standard' | 'strategist';
      };
      this.operations.push(body);
      if(body.operation==='profile')return this.respond(route,{profile:this.profile});
      if(body.operation==='save-profile'){
        this.profile={...this.profile,name:body.name!,avatar:body.avatar!,country:body.country!,storyWins:Math.max(this.profile.storyWins,body.storyWins??0)};
        return this.respond(route,{profile:this.profile});
      }
      if(body.operation==='list')return this.respond(route,{tables:this.room.visibility==='public'&&this.room.status==='lobby'&&this.room.players.length<(this.room.lobbyOptions?.seatLimit??6)?[{code:CODE,host:this.room.players[0],playerCount:this.room.players.length,options:this.room.lobbyOptions,updatedAt:this.room.updatedAt}]:[]});
      if (body.operation === 'history' || body.operation === 'leaderboard')
        return this.respond(route, []);
      if (this.closed && body.operation !== 'create')
        return this.respond(
          route,
          { error: 'This table has closed.', code: 'ROOM_NOT_FOUND' },
          404,
        );
      if (body.operation === 'get' && this.holdNextPoll) {
        this.holdNextPoll = false;
        this.heldPoll = { route, snapshot: this.snapshot() };
        return;
      }
      if (body.operation === 'create') {
        this.closed = false;
        this.room.players[0].name = body.name || 'Alex';
        this.room.players[0].avatar = body.avatar;
        this.room.players[0].country=body.country;
        this.room.visibility=body.visibility??'private';
        this.room.lobbyOptions={mapId:'classic',seatLimit:6,botDifficulty:'standard'};
      }
      if(body.operation==='configure'){
        this.room.visibility=body.visibility;this.room.lobbyOptions=body.options;this.room.version++;
      }
      if (body.operation === 'start') this.start(this.room.visibility==='public'?{...body,...this.room.lobbyOptions}:body);
      if (body.operation === 'action') {
        if (body.expectedVersion !== this.room.version)
          return this.respond(
            route,
            { error: 'A newer move is available.', code: 'STALE_VERSION' },
            409,
          );
        this.fullGame = applyAction(this.fullGame!, body.action!);
        this.room.version++;
      }
      if (body.operation === 'leave') return this.respond(route, { ok: true });
      if (body.operation === 'end') {
        if (this.viewerId !== this.room.hostId)
          return this.respond(route, { error: 'Only the host can end this table.', code: 'HOST_ONLY' }, 403);
        this.closed = true;
        return this.respond(route, { ok: true });
      }
      return this.respond(route, this.snapshot());
    });
  }
}

async function openOnline(page: Page) {
  await page.getByRole('button', { name: /Across the city/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function join(page: Page) {
  await openOnline(page);
  await page.getByRole('button', { name: 'Join friends', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Morgan');
  await page.getByLabel('Room code', { exact: true }).fill(CODE);
  await page.getByRole('button', { name: 'Take your seat' }).click();
}
async function expectBoard(page: Page) {
  await expect(page.getByRole('heading', { name: 'The boardroom.' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Acquire game board' })).toBeVisible();
  await expect(page.locator('.room-tag')).toHaveText(`ROOM ${CODE}`);
}

test.describe('online room UI — HTTP-mocked Supabase', () => {
  test('a customized face accompanies the player into the lobby and game', async ({ page }) => {
    const avatar = encodeAvatar({ ...DEFAULT_AVATAR, accessory: 5, color: 20 });
    await page.addInitScript((avatar) => localStorage.setItem('aquire.profile.v1', JSON.stringify({ name: 'Captain Cash', avatar, royalTitle: 'Queen' })), avatar);
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Captain Cash');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await expect(page.locator('.lobby-players .character-avatar').first()).toBeVisible();
    expect(backend.operations.find((operation) => operation.operation === 'create')).toMatchObject({ name: 'Captain Cash', avatar });
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    const player = backend.fullGame!.players.find((player) => player.id === HOST)!;
    expect(player.avatar).toBe(avatar);
    await expect(page.locator('.player-chip').filter({ hasText: 'Captain Cash' }).locator('.character-avatar')).toBeVisible();
  });
  test('host creates a lobby and starts a playable table', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await expect(page.locator('.room-code')).toContainText(CODE);
    await expect(page.getByRole('button', { name: 'Start the game' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(backend.authCalls).toBe(1);
    expect(
      backend.operations.some(
        (operation) => operation.operation === 'create' && operation.name === 'Alex',
      ),
    ).toBeTruthy();
    expect(backend.operations.some((operation) => operation.operation === 'start')).toBeTruthy();
  });
  test('a host can save an online room for later, then end it from My games', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    await page.locator('.game-topline').getByRole('button', { name: 'The clubhouse' }).click();
    await page.getByRole('dialog', { name: 'Leave this online game?' }).getByRole('button', { name: 'Save & exit' }).click();
    await page.clock.install();
    const readsAfterExit = backend.operations.filter((operation) => operation.operation === 'get').length;
    await page.clock.runFor(65000);
    expect(backend.operations.filter((operation) => operation.operation === 'get')).toHaveLength(readsAfterExit);
    await page.reload();
    await page.locator('.sidebar nav').getByRole('button', { name: /My games/ }).click();
    const row = page.locator('.saved-game-row').filter({ hasText: CODE });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'End game' }).click();
    await page.getByRole('dialog', { name: 'End this online game?' }).getByRole('button', { name: 'End game for everyone' }).click();
    await expect(row).toHaveCount(0);
    expect(backend.closed).toBe(true);
    expect(backend.operations.some((operation) => operation.operation === 'end')).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('aquire.room'))).toBeNull();
  });
  test('a guest can leave without ending the online room for everyone', async ({ page }) => {
    const backend = new MockSupabase(GUEST);
    backend.start();
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expectBoard(page);
    await page.locator('.game-topline').getByRole('button', { name: 'The clubhouse' }).click();
    await page.getByRole('dialog', { name: 'Leave this online game?' }).getByRole('button', { name: 'Leave game' }).click();
    await expect(page.getByRole('heading', { name: /A little vision/ })).toBeVisible();
    expect(backend.closed).toBe(false);
    expect(backend.operations.some((operation) => operation.operation === 'leave')).toBe(true);
    expect(backend.operations.some((operation) => operation.operation === 'end')).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('aquire.room'))).toBeNull();
  });
  test('host can select a variant map and strategic computers before starting', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await page.getByLabel('City map').selectOption('courtyard');
    await page.getByLabel('Computer difficulty').selectOption('strategist');
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ mapId: 'courtyard', botDifficulty: 'strategist' });
    expect(backend.fullGame?.mapId).toBe('courtyard');
    await expect(page.locator('.board-tile.map-void')).toHaveCount(6);
  });

  test('host can configure a 12-seat expansion table online', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await page.getByLabel('City map').selectOption('max-metropolis');
    await expect(page.locator('.map-miniature .included')).toHaveCount(384);
    await page.getByLabel('Invite the house').selectOption('11');
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    await expect(page.locator('.board-tile')).toHaveCount(384);
    expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ mapId: 'max-metropolis', botCount: 11 });
  });

  test('host can start a newly shaped city on an updated room function', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await page.getByLabel('City map').selectOption('big-trident-towers');
    await expect(page.locator('.map-miniature .included')).toHaveCount(206);
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    await expect(page.locator('.board-tile')).toHaveCount(270);
    expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ mapId: 'big-trident-towers' });
  });

  test('older room functions keep unknown new maps disabled', async ({ page }) => {
    const backend = new MockSupabase();
    backend.room.features = backend.room.features?.filter((feature) => feature !== 'shaped-maps-v2');
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    await expect(page.getByLabel('City map').locator('option[value="obelisk"]')).toBeDisabled();
    await expect(page.getByLabel('City map').locator('option[value="big-trident-towers"]')).toBeDisabled();
    await expect(page.getByLabel('City map').locator('option[value="big-rectangle"]')).toBeEnabled();
  });

  test('creative maps require their own server capability and start once supported', async ({ page }) => {
    const backend = new MockSupabase();
    backend.room.features = backend.room.features?.filter((feature) => feature !== 'shaped-maps-v3');
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    const city = page.getByLabel('City map');
    for (const id of ['lunar-moth', 'big-dragon-spine', 'mega-thunderbird', 'max-astral-loom']) {
      await expect(city.locator(`option[value="${id}"]`)).toBeDisabled();
    }
    await expect(city.locator('option[value="obelisk"]')).toBeEnabled();
    backend.room.features!.push('shaped-maps-v3');
    await page.reload();
    await openOnline(page);
    await city.selectOption('max-astral-loom');
    await expect(page.locator('.map-miniature .included')).toHaveCount(421);
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    await expect(page.locator('.board-tile')).toHaveCount(625);
    expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ mapId: 'max-astral-loom' });
  });

  test('host sends optional house rules into a playable online room', async ({ page }) => {
    const backend = new MockSupabase();
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    const lobby = page.getByRole('dialog', { name: 'Your private table' });
    await lobby.getByLabel('Starting cash').fill('12000');
    await lobby.getByLabel('Tiles to place per turn').fill('2');
    await lobby.getByLabel('Shares to buy per turn').fill('5');
    await lobby.getByLabel('Market fluctuation').selectOption('market');
    await lobby.getByLabel('Market roll frequency').selectOption('turn');
    await lobby.getByLabel('Round-end dividends').check();
    await lobby.locator('.hotel-choice').filter({ hasText: 'Budgeton' }).locator('input[type="checkbox"]').check();
    await lobby.locator('.hotel-choice').filter({ hasText: 'Sackson' }).locator('input[type="checkbox"]').uncheck();
    await lobby.getByRole('spinbutton', { name: 'Budgeton shares available' }).fill('50');
    await lobby.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ houseRules: { startingCash: 12000, placementsPerTurn: 2, buyLimit: 5, dividends: true, marketMode: 'market', marketFrequency: 'turn', shareSupply: { budgeton: 50 } } });
    expect(backend.fullGame?.players.every((player) => player.cash === 12000)).toBe(true);
    expect(backend.fullGame?.houseRules?.hotelChains).toContain('budgeton');
    expect(backend.fullGame?.houseRules?.hotelChains).not.toContain('sackson');
    expect(backend.fullGame?.bank.budgeton).toBe(50);
  });

  test('older room functions hide hotel controls and receive only supported rules', async ({ page }) => {
    const backend = new MockSupabase();
    backend.room.features = backend.room.features?.filter((feature) => !['hotel-roster-v1', 'hotel-stock-v1', 'market-frequency-v1'].includes(feature));
    await backend.install(page);
    await page.goto('/');
    await openOnline(page);
    await page.getByLabel('Your name', { exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Open your table' }).click();
    const lobby = page.getByRole('dialog', { name: 'Your private table' });
    await expect(lobby.locator('.hotel-roster-grid')).toHaveCount(0);
    await lobby.getByLabel('Market fluctuation').selectOption('market');
    await expect(lobby.getByLabel('Market roll frequency')).toHaveCount(0);
    await lobby.getByRole('button', { name: 'Start the game' }).click();
    await expectBoard(page);
    const operation = backend.operations.find((entry) => entry.operation === 'start') as { houseRules: Record<string, unknown> };
    expect(operation.houseRules).not.toHaveProperty('hotelChains');
    expect(operation.houseRules).not.toHaveProperty('shareSupply');
    expect(operation.houseRules).not.toHaveProperty('marketFrequency');
    expect(backend.fullGame?.houseRules?.hotelChains).toHaveLength(7);
  });

  test('guest joins the lobby and follows the host’s start through polling', async ({ page }) => {
    const backend = new MockSupabase(GUEST);
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expect(page.getByText('Waiting for the host to start…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
    backend.start();
    await expectBoard(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Alex is finding their next opportunity.')).toBeVisible();
    await expect(page.locator('.tile-rack .rack-tile')).toHaveCount(6);
  });

  test('refresh restores an online room using the saved code and guest session', async ({
    page,
  }) => {
    const backend = new MockSupabase(GUEST);
    backend.start();
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expectBoard(page);
    expect(backend.authCalls).toBe(1);
    await page.reload();
    await openOnline(page);
    await expect(page.locator('.room-code')).toContainText(CODE);
    await page.getByRole('button', { name: 'Return to your game' }).click();
    await expectBoard(page);
    expect(backend.authCalls).toBe(1);
    expect(backend.operations.filter((operation) => operation.operation === 'join')).toHaveLength(
      1,
    );
    expect(backend.operations.some((operation) => operation.operation === 'get')).toBe(true);
  });

  test('finished rooms remain inspectable and offer a route to another table', async ({ page }) => {
    const backend = new MockSupabase();
    backend.finish();
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expect(page.getByRole('heading', { name: 'Alex takes the crown.' })).toBeVisible();
    await expect(page.getByTestId('match-rewards')).toHaveCount(0);
    await page.getByRole('button', { name: /Back to the clubhouse/ }).click();
    await openOnline(page);
    await expect(page.getByRole('button', { name: 'Find another table' })).toBeVisible();
    await page.getByRole('button', { name: 'Find another table' }).click();
    await expect(page.getByRole('button', { name: 'Open your table' })).toBeVisible();
    expect(backend.operations.some((operation) => operation.operation === 'leave')).toBeTruthy();
    expect(await page.evaluate(() => localStorage.getItem('aquire.room'))).toBeNull();
  });

  test('a closed guest lobby recovers to room creation instead of stranding the player', async ({
    page,
  }) => {
    const backend = new MockSupabase(GUEST);
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expect(page.getByText('Waiting for the host to start…')).toBeVisible();
    backend.closed = true;
    await expect(
      page.getByRole('heading', { name: 'Good company. Great competition.' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('This table has closed.');
    await expect(page.getByText('Waiting for the host to start…')).toHaveCount(0);
    await page.getByRole('button', { name: 'Create a table', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open your table' })).toBeVisible();
  });

  test('a delayed stale poll cannot undo an accepted player action', async ({ page }) => {
    const backend = new MockSupabase();
    backend.start();
    backend.holdNextPoll = true;
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expectBoard(page);
    await expect.poll(() => Boolean(backend.heldPoll)).toBe(true);
    const tile = backend.fullGame!.players[0].hand.find(
      (item) => analyzeTile(backend.fullGame!, item).kind === 'independent',
    )!;
    expect(tile).toBeTruthy();
    await page.locator('.tile-rack .rack-tile').filter({ hasText: tile }).click();
    await page.getByRole('button', { name: `Place ${tile}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Invest in the market' })).toBeVisible();
    const pollsBeforeRelease = backend.operations.filter(
      (operation) => operation.operation === 'get',
    ).length;
    await backend.releasePoll();
    // Advance through another polling response as well, rather than relying on a short sleep.
    await expect
      .poll(() => backend.operations.filter((operation) => operation.operation === 'get').length)
      .toBeGreaterThan(pollsBeforeRelease);
    await expect(page.getByRole('heading', { name: 'Invest in the market' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip buying' })).toBeVisible();
    expect(backend.operations.filter((operation) => operation.operation === 'action')).toHaveLength(
      1,
    );
  });

  test('one polled update queues other human and computer turns with separate boards and skips your own', async ({
    page,
  }) => {
    const backend = new MockSupabase();
    backend.room.players.push(
      { id: GUEST, name: 'Morgan', isBot: false },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Jordan', isBot: true },
    );
    backend.start();
    const initial = backend.fullGame!;
    initial.board = { '1A': 'worldwide', '2A': 'worldwide', '6B': 'independent' };
    const hands = [
      ['3A', '12I', '12G', '12E', '12C', '12A'],
      ['6A', '11I', '11G', '11E', '11C', '11A'],
      ['7A', '10I', '10G', '10E', '10C', '10A'],
    ];
    initial.players.forEach((player, index) => {
      player.hand = hands[index];
    });
    initial.bag = ALL_TILES.filter((tile) => !initial.board[tile] && !hands.flat().includes(tile));
    backend.holdNextPoll = true;
    await backend.install(page);
    await page.goto('/');
    await join(page);
    await expectBoard(page);
    await expect.poll(() => Boolean(backend.heldPoll)).toBe(true);
    await expect(page.getByTestId('turn-recap')).toHaveCount(0);

    // Three turns arrive together, as when another device and server bots move
    // between polls. Only Morgan and Jordan should need reviewing on Alex's device.
    let next = applyAction(initial, { type: 'place', tile: '3A' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 1 } });
    next = applyAction(next, { type: 'place', tile: '6A' });
    next = applyAction(next, { type: 'found', chain: 'sackson' });
    next = applyAction(next, { type: 'buy', stocks: { sackson: 2 } });
    next = applyAction(next, { type: 'place', tile: '7A' });
    next = applyAction(next, { type: 'buy', stocks: { worldwide: 1, sackson: 2 } });
    backend.fullGame = next;
    backend.room.version++;
    backend.heldPoll!.snapshot = backend.snapshot();
    await backend.releasePoll();

    const recap = page.getByTestId('turn-recap');
    const sacksonColor = CHAINS.find((chain) => chain.id === 'sackson')!.color;
    await expect(page.getByRole('dialog', { name: 'Morgan’s turn' })).toBeVisible();
    await expect(recap.locator('.recap-coordinate')).toHaveText('6A');
    await expect(
      recap.getByRole('img', { name: 'Board after turn 2, placed tile 6A highlighted' }),
    ).toBeVisible();
    await expect(recap.locator('[data-highlighted="true"]')).toHaveAttribute('data-tile', '6A');
    await expect(recap.locator('[data-tile="6A"] rect').first()).toHaveAttribute(
      'fill',
      sacksonColor,
    );
    await expect(recap.locator('[data-tile="7A"] rect').first()).toHaveAttribute('fill', '#eeeae2');
    await expect(recap.locator('.recap-purchase')).toHaveCount(1);
    await expect(recap.locator('.recap-purchase')).toContainText('Sackson');
    await expect(recap.locator('.recap-purchase')).toContainText('2 shares');
    await expect(recap).toContainText('1 more turn to review');
    await expect(page.getByRole('group', { name: 'Acquire game board' })).toHaveCount(0);
    await expect(page.locator('[inert]')).toContainText('The boardroom.');

    await recap.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Jordan’s turn' })).toBeVisible();
    await expect(recap.locator('.recap-kicker')).toContainText('COMPUTER');
    await expect(recap.locator('.recap-coordinate')).toHaveText('7A');
    await expect(
      recap.getByRole('img', { name: 'Board after turn 3, placed tile 7A highlighted' }),
    ).toBeVisible();
    await expect(recap.locator('[data-highlighted="true"]')).toHaveAttribute('data-tile', '7A');
    await expect(recap.locator('[data-tile="7A"] rect').first()).toHaveAttribute(
      'fill',
      sacksonColor,
    );
    await expect(recap.locator('.recap-purchase')).toHaveCount(2);
    await expect(recap.locator('.recap-purchase').filter({ hasText: 'Worldwide' })).toContainText(
      '1 share',
    );
    await expect(recap.locator('.recap-purchase').filter({ hasText: 'Sackson' })).toContainText(
      '2 shares',
    );
    await expect(recap).toContainText('All caught up after this turn');
    await expect(page.getByRole('group', { name: 'Acquire game board' })).toHaveCount(0);

    await recap.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(recap).toHaveCount(0);
    await expectBoard(page);
    await expect(page.locator('[inert]')).toHaveCount(0);
    await page.locator('.tile-rack .rack-tile').filter({ hasText: '12I' }).click();
    await expect(page.getByRole('button', { name: 'Place 12I', exact: true })).toBeEnabled();
    const polls = backend.operations.filter((operation) => operation.operation === 'get').length;
    await expect
      .poll(() => backend.operations.filter((operation) => operation.operation === 'get').length)
      .toBeGreaterThan(polls);
    await expect(recap).toHaveCount(0);
    expect(backend.operations.filter((operation) => operation.operation === 'action')).toHaveLength(
      0,
    );
  });
});

for (const [before, names] of [
  [0, ['Winner’s laurels', 'First online trophy']],
  [1, []],
  [4, ['Diamond monocle', 'Golden confetti']],
] as const) test(`winner page only announces newly earned online rewards after win ${before + 1}`, async ({ page }) => {
  const backend = new MockSupabase();
  backend.profile.wins = before;
  backend.start();
  await backend.install(page);
  await page.goto('/');
  await join(page);
  await expectBoard(page);
  await expect.poll(() => backend.operations.filter((op) => op.operation === 'profile').length).toBe(1);
  backend.finish();
  backend.profile.wins = before + 1;
  // A foreground resume fetches the changed room without adding gameplay polling.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Alex takes the crown.' })).toBeVisible();
  await expect.poll(() => backend.operations.filter((op) => op.operation === 'profile').length).toBe(2);
  const rewards = page.getByTestId('match-rewards');
  if (names.length) {
    await expect(rewards.locator('li')).toHaveCount(names.length);
    for (const name of names) await expect(rewards.locator('strong').filter({ hasText: name })).toBeVisible();
    expect(await page.locator('.finale').evaluate((el) => el.children[1].className)).toBe('winner-celebration');
  } else await expect(rewards).toHaveCount(0);
  // The receipt survives reload; viewing the finished room does not earn the items again.
  await page.reload();
  await openOnline(page);
  await page.getByRole('button', { name: 'Return to your game' }).click();
  await expect(page.getByRole('heading', { name: 'Alex takes the crown.' })).toBeVisible();
  await expect(rewards.locator('li')).toHaveCount(names.length);
  expect(backend.operations.filter((op) => op.operation === 'profile')).toHaveLength(2);
  if (names.length) {
    await rewards.getByRole('button', { name: 'Try on your rewards' }).click();
    await page.getByRole('button', { name: new RegExp(`${names[0]} Earned`) }).click();
    await expect(page.getByRole('combobox', { name: 'accessory', exact: true })).toHaveValue(before === 0 ? '19' : '20');
  }
});


test('two human seats can start a tiny city without adding computers', async ({ page }) => {
  const backend = new MockSupabase();
  backend.room.players.push({ id: GUEST, name: 'Morgan', isBot: false });
  await backend.install(page);
  await page.goto('/'); await openOnline(page);
  await page.getByRole('button', { name: 'Open your table' }).click();
  await page.getByLabel('City map').selectOption('duo-sugar-steps');
  await expect(page.getByRole('button', { name: 'Start the game' })).toBeEnabled();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expectBoard(page);
  expect(backend.fullGame?.players).toHaveLength(2);
  expect(backend.fullGame?.mapId).toBe('duo-sugar-steps');
  expect(backend.operations.find((operation) => operation.operation === 'start')).toMatchObject({ botCount: 0, mapId: 'duo-sugar-steps' });
});

test('an older online server keeps small cities and two-seat starts disabled', async ({ page }) => {
  const backend = new MockSupabase();
  backend.room.features = backend.room.features?.filter((feature) => feature !== 'small-tables-v1');
  await backend.install(page);
  await page.goto('/'); await openOnline(page);
  await page.getByRole('button', { name: 'Open your table' }).click();
  await expect(page.locator('option[value="duo-pocket-square"]')).toBeDisabled();
  await expect(page.locator('option[value="four-market-square"]')).toBeDisabled();
  await page.locator('#bot-seats').selectOption('1');
  await expect(page.getByRole('button', { name: 'Start the game' })).toBeDisabled();
});

test('public host publishes map and seats before starting with the advertised rules', async ({page}) => {
  const backend=new MockSupabase();await backend.install(page);await page.goto('/');await openOnline(page);
  await page.getByLabel('Who can join?').selectOption('public');await page.getByRole('button',{name:'Open your table'}).click();
  await expect(page.getByRole('dialog',{name:'Your open table'})).toBeVisible();
  expect(backend.operations.find((op)=>op.operation==='create')).toMatchObject({visibility:'public',country:'',storyWins:0});
  await page.getByLabel('City map',{exact:true}).selectOption('duo-pocket-square');
  await expect(page.getByRole('button',{name:'Publish table settings'})).toBeVisible();
  await page.getByRole('button',{name:'Publish table settings'}).click();
  await expect(page.getByRole('button',{name:'Refresh public listing'})).toBeVisible();
  expect(backend.room.lobbyOptions).toMatchObject({mapId:'duo-pocket-square',seatLimit:2,houseRules:{startingCash:6000}});
  backend.room.players.push({id:GUEST,name:'Morgan',isBot:false});backend.room.version++;
  await expect(page.locator('.lobby-players')).toContainText('Morgan');
  await page.getByRole('button',{name:'Start the game'}).click();
  await expect(page.locator('.board-card')).toHaveAttribute('data-map','duo-pocket-square');
  expect(backend.fullGame!.players).toHaveLength(2);
});

test('open tables show rules, guest profiles, and a working join action', async ({page}) => {
  const backend=new MockSupabase(GUEST);backend.room.visibility='public';
  backend.room.lobbyOptions={mapId:'classic',seatLimit:6,botDifficulty:'strategist'};
  backend.room.players[0].country='US';await backend.install(page);await page.goto('/');await openOnline(page);
  await page.getByRole('button',{name:'Open tables',exact:true}).click();
  await expect(page.locator('.open-table-card')).toContainText('Alex’s table');
  await expect(page.locator('.open-table-card')).toContainText('United States');
  await page.getByText('See the city and rules',{exact:true}).click();
  await expect(page.locator('.open-table-card')).toContainText('Your rack always stays private');
  await page.getByRole('button',{name:'View Alex’s profile'}).click();
  await expect(page.getByRole('dialog',{name:'Alex’s profile'})).toBeVisible();
  await expect(page.locator('.profile-stats')).toContainText('25.0%');
  await expect(page.locator('.profile-stats')).toContainText('2.25');
  await page.getByRole('button',{name:'Back to the tables'}).click();
  await page.getByRole('button',{name:'Join Alex',exact:true}).click();
  await expect(page.locator('.lobby-players')).toContainText('Morgan');
  expect(backend.operations.find((op)=>op.operation==='join')).toMatchObject({code:CODE});
});

test('online record unlocks earned cosmetics and profile save sends no client statistics', async ({page}) => {
  const backend=new MockSupabase();await backend.install(page);await page.goto('/');await openOnline(page);
  await page.getByRole('button',{name:'Open your table'}).click();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Customize your character'}).click();
  await page.getByRole('button',{name:'Online record',exact:true}).click();
  await expect(page.locator('.profile-stats')).toContainText('25.0%');
  await page.getByRole('button',{name:'Win rewards',exact:true}).click();
  const laurels=page.getByRole('button',{name:/Winner’s laurels Earned/});await expect(laurels).toBeEnabled();
  await expect(page.getByRole('button',{name:/Diamond monocle 1\/5/})).toBeDisabled();
  await laurels.click();await expect(page.getByRole('combobox',{name:'accessory',exact:true})).toHaveValue('19');
  await page.getByLabel('Country · optional').selectOption('CA');await page.getByRole('button',{name:'Save my character'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const request=backend.operations.find((op)=>op.operation==='save-profile')!;
  expect(request).toMatchObject({country:'CA',storyWins:0});expect(request.wins).toBeUndefined();expect(request.games).toBeUndefined();
  expect(backend.profile.avatar).toBe(encodeAvatar({...DEFAULT_AVATAR,accessory:19}));
});

test('public directory, rules and long guest profiles fit portrait and landscape phones', async({page})=>{
 const backend=new MockSupabase(GUEST);backend.room.visibility='public';backend.room.players[0].name='WWWWWWWWWWWWWWWWWWWWWWWW';
 backend.room.lobbyOptions={mapId:'classic',seatLimit:6,botDifficulty:'standard'};
 await backend.install(page);await page.goto('/');await openOnline(page);await page.getByRole('button',{name:'Open tables',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.locator('.open-table-card')).toHaveCount(1);
 for(const [width,height] of [[320,568],[393,700],[852,320]]){
  await page.setViewportSize({width,height});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await page.getByRole('button',{name:/View WWWW/}).click();
 for(const [width,height] of [[320,568],[393,700],[852,320]]){
  await page.setViewportSize({width,height});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
});
