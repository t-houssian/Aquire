import { readProfile } from '../lib/profile';
import { kingdomUnlocked } from '../lib/campaign';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Users,
  WifiOff,
} from 'lucide-react';
import { countryName } from '../lib/countries';
import ProfileStats from './ProfileStats';
import { storyRuleBriefing } from '../game/campaign';
import '../social.css';
import Modal from './Modal';
import MapPreview from './MapPreview';
import CharacterAvatar from './CharacterAvatar';
import {
  MAPS,
  NEW_MAP_IDS,
  CREATIVE_MAP_IDS,
  SMALL_MAP_IDS,
  MAP_SEAT_TIERS,
  getMap,
} from '../game/maps';
import { DEFAULT_HOUSE_RULES } from '../game/engine';
import type { BotDifficulty, MapId } from '../game/types';
import type { Settings } from '../lib/storage';
import HouseRulesControls, { maximumOpeningTiles } from './HouseRulesControls';
import {
  createRoom,
  configureLobby,
  listOpenTables,
  getOnlineProfile,
  endRoom,
  joinRoom,
  leaveRoom,
  onlineConfigured,
  onlineSetupMessage,
  startRoom,
  type OnlineRoom,
  type OpenTable,
  type OnlinePlayer,
  type OnlineProfile,
} from '../lib/online';
export default function OnlinePanel({
  room,
  onRoom,
  onClose,
  onLocal,
  onPlay,
  settings,
  onSettingsChange,
}: {
  room: OnlineRoom | null;
  onRoom: (r: OnlineRoom | null) => void;
  onClose: () => void;
  onLocal: () => void;
  onPlay: () => void;
  settings?: Settings;
  onSettingsChange?: (settings: Settings) => void;
}) {
  const [name, setName] = useState(() => readProfile().name),
    [code, setCode] = useState(() => localStorage.getItem('aquire.room') || ''),
    [tab, setTab] = useState<'create' | 'join' | 'browse'>('create'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [bots, setBots] = useState(2),
    [mapId, setMapId] = useState<MapId>('classic'),
    [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('standard'),
    [houseRules, setHouseRules] = useState(() => ({
      ...(settings?.houseRules ?? DEFAULT_HOUSE_RULES),
    })),
    [copied, setCopied] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private'),
    [seatLimit, setSeatLimit] = useState(6);
  const [tables, setTables] = useState<OpenTable[]>([]),
    [directoryLoading, setDirectoryLoading] = useState(false),
    [directoryError, setDirectoryError] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<OnlinePlayer | null>(null),
    [profileRecord, setProfileRecord] = useState<OnlineProfile | null>(null);
  const directoryRequest = useRef(false);
  const publicTable = room?.visibility === 'public';
  const publishedKey = JSON.stringify(room?.lobbyOptions);
  useEffect(() => {
    if (room?.visibility !== 'public') return;
    const published = room.lobbyOptions;
    setMapId(published?.mapId ?? 'classic');
    setSeatLimit(published?.seatLimit ?? 6);
    setBotDifficulty(published?.botDifficulty ?? 'standard');
    setHouseRules(published?.houseRules ?? { ...DEFAULT_HOUSE_RULES });
  }, [room?.id, room?.visibility, publishedKey]);
  const refreshDirectory = async () => {
    if (directoryRequest.current || document.hidden) return;
    directoryRequest.current = true;
    setDirectoryLoading(true);
    setDirectoryError('');
    try {
      setTables(await listOpenTables());
    } catch (e) {
      setDirectoryError(e instanceof Error ? e.message : 'Open tables could not be loaded.');
    } finally {
      directoryRequest.current = false;
      setDirectoryLoading(false);
    }
  };
  useEffect(() => {
    if (tab !== 'browse' || room || selectedProfile || !onlineConfigured) return;
    void refreshDirectory();
    const timer = window.setInterval(() => void refreshDirectory(), 60000);
    const visible = () => {
      if (!document.hidden) void refreshDirectory();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [tab, room?.id, selectedProfile?.id]);
  const previewRef = useRef<HTMLDivElement>(null);
  const selectedMap = getMap(mapId);
  const selectedSeatLimit = publicTable
    ? Math.min(seatLimit, selectedMap.maxPlayers)
    : selectedMap.maxPlayers;
  const roomCapacity = Math.max(0, selectedSeatLimit - (room?.players.length ?? 0));
  const selectedBots = Math.min(bots, roomCapacity);
  const effectiveHouseRules = {
    ...houseRules,
    startingTilesPerPlayer: Math.min(
      houseRules.startingTilesPerPlayer,
      maximumOpeningTiles(
        selectedMap.tiles.length,
        publicTable ? selectedSeatLimit : Math.max(1, (room?.players.length ?? 1) + selectedBots),
      ),
    ),
  };
  const publishedRules = room?.lobbyOptions?.houseRules ?? DEFAULT_HOUSE_RULES;
  const unpublished = Boolean(
    publicTable &&
      (mapId !== (room?.lobbyOptions?.mapId ?? 'classic') ||
        selectedSeatLimit !== (room?.lobbyOptions?.seatLimit ?? 6) ||
        botDifficulty !== (room?.lobbyOptions?.botDifficulty ?? 'standard') ||
        (Object.keys(DEFAULT_HOUSE_RULES) as (keyof typeof DEFAULT_HOUSE_RULES)[]).some(
          (key) => JSON.stringify(effectiveHouseRules[key]) !== JSON.stringify(publishedRules[key]),
        )),
  );
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = () =>
    run(async () => {
      const r =
        tab === 'create'
          ? await createRoom(name.trim() || 'Investor', 'classic', visibility)
          : await joinRoom(code, name.trim() || 'Investor');
      onRoom(r);
      if (r.visibility === 'public') setBots(0);
      localStorage.setItem('aquire.room', r.code);
      if (r.game) onPlay();
    });
  return (
    <Modal
      className="online-social-modal"
      title={
        selectedProfile
          ? `${selectedProfile.name}’s profile`
          : room
            ? publicTable
              ? 'Your open table'
              : 'Your private table'
            : 'Good company. Great competition.'
      }
      onClose={selectedProfile ? () => setSelectedProfile(null) : onClose}
    >
      <div className="modal-body">
        {selectedProfile ? (
          <>
            <button className="text-button" onClick={() => setSelectedProfile(null)}>
              <ArrowLeft size={15} /> Back to the tables
            </button>
            <div className="avatar-editor-preview">
              <CharacterAvatar
                avatar={profileRecord?.avatar ?? selectedProfile.avatar}
                name={profileRecord?.name ?? selectedProfile.name}
              />
              <strong>{profileRecord?.name ?? selectedProfile.name}</strong>
            </div>
            {busy ? (
              <p className="muted">
                <LoaderCircle className="spin" size={16} /> Loading record…
              </p>
            ) : (
              <ProfileStats record={profileRecord} />
            )}
          </>
        ) : !onlineConfigured ? (
          <div className="online-unavailable">
            <div className="feature-icon">
              <WifiOff size={28} />
            </div>
            <h3>Online tables aren’t connected yet.</h3>
            <p>{onlineSetupMessage}</p>
            <p className="muted">
              In the meantime, bring everyone around one device. Pass-and-play supports up to twelve
              people on the largest expansion maps.
            </p>
            <button className="button primary full" onClick={onLocal}>
              Start a pass-and-play game <ArrowRight size={17} />
            </button>
          </div>
        ) : room ? (
          <>
            <p className="muted">
              {publicTable
                ? 'Anyone can discover this table and take an open seat.'
                : 'Share this code. Save a seat. Let the game begin.'}
            </p>
            <div className="room-code">
              <span>{room.code}</span>
              <button
                className="icon-button"
                aria-label="Copy room code"
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(room.code);
                    setCopied(true);
                  })
                }
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            <div className="lobby-players">
              {room.players.map((p, i) => (
                <div key={p.id}>
                  <button
                    className="lobby-profile-button"
                    aria-label={`View ${p.name}’s profile`}
                    disabled={p.isBot || busy || !room.features?.includes('profiles-v1')}
                    onClick={() => {
                      setSelectedProfile(p);
                      setProfileRecord(null);
                      void run(async () => setProfileRecord(await getOnlineProfile(p.id)));
                    }}
                  >
                    <span className="avatar">
                      <CharacterAvatar
                        characterId={p.characterId}
                        avatar={p.avatar}
                        name={p.name}
                      />
                    </span>
                    <strong>{p.name}</strong>
                  </button>
                  <small>{p.id === room.hostId ? 'Host' : `Seat ${i + 1}`}</small>
                  <span className="live-dot" />
                </div>
              ))}
            </div>
            {room.status === 'lobby' ? (
              room.viewerId === room.hostId ? (
                <>
                  <label className="field-label" htmlFor="bot-seats">
                    Invite the house
                  </label>
                  <select
                    id="bot-seats"
                    value={selectedBots}
                    onChange={(e) => {
                      const nextBots = Number(e.target.value);
                      setBots(nextBots);
                      setHouseRules((rules) => ({
                        ...rules,
                        startingTilesPerPlayer: Math.min(
                          rules.startingTilesPerPlayer,
                          maximumOpeningTiles(
                            selectedMap.tiles.length,
                            Math.max(1, room.players.length + nextBots),
                          ),
                        ),
                      }));
                    }}
                  >
                    {Array.from({ length: roomCapacity + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i === 0
                          ? 'No computer opponents'
                          : `${i} computer opponent${i === 1 ? '' : 's'}`}
                      </option>
                    ))}
                  </select>
                  <div className="setup-options">
                    <span className="eyebrow">TABLE RULES & OPTIONS</span>
                    <p className="small muted">
                      2008 share prices and bonuses stay fixed. Custom cities may change the
                      footprint, seat limit, and end target.
                    </p>
                    <label className="field-label" htmlFor="online-map">
                      City map
                    </label>
                    <select
                      id="online-map"
                      value={mapId}
                      disabled={!room.features?.includes('maps-v1')}
                      onChange={(event) => {
                        const next = getMap(event.target.value as MapId);
                        setMapId(next.id);
                        setSeatLimit(next.maxPlayers);
                        setHouseRules((rules) => ({
                          ...rules,
                          startingTilesPerPlayer: Math.min(
                            rules.startingTilesPerPlayer,
                            maximumOpeningTiles(
                              next.tiles.length,
                              Math.max(
                                1,
                                room.players.length +
                                  Math.min(
                                    bots,
                                    Math.max(0, next.maxPlayers - room.players.length),
                                  ),
                              ),
                            ),
                          ),
                        }));
                        requestAnimationFrame(() =>
                          previewRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          }),
                        );
                      }}
                    >
                      {MAP_SEAT_TIERS.map((seats) => (
                        <optgroup key={seats} label={`Up to ${seats} players`}>
                          {MAPS.filter(
                            (map) =>
                              (map.id !== 'goldspire-kingdom' ||
                                (kingdomUnlocked() && room?.features?.includes('kingdom-v1'))) &&
                              map.maxPlayers === seats,
                          ).map((map) => (
                            <option
                              key={map.id}
                              value={map.id}
                              disabled={
                                (map.maxPlayers > 6 && !room.features?.includes('large-maps-v1')) ||
                                (NEW_MAP_IDS.has(map.id) &&
                                  !room.features?.includes('shaped-maps-v2')) ||
                                (CREATIVE_MAP_IDS.has(map.id) &&
                                  !room.features?.includes('shaped-maps-v3')) ||
                                (SMALL_MAP_IDS.has(map.id) &&
                                  !room.features?.includes('small-tables-v1'))
                              }
                            >
                              {map.name} · {map.tiles.length} tiles · {map.columns}×{map.rows}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <div ref={previewRef}>
                      <MapPreview map={selectedMap} />
                    </div>
                    {publicTable && (
                      <label className="field-label">
                        Seats at this table
                        <select
                          aria-label="Open table seat limit"
                          value={selectedSeatLimit}
                          onChange={(e) => setSeatLimit(Number(e.target.value))}
                        >
                          {Array.from({ length: selectedMap.maxPlayers - 1 }, (_, i) => (
                            <option key={i} value={i + 2}>
                              {i + 2} players
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {room.players.length > selectedMap.maxPlayers && (
                      <p className="small muted">
                        This map has {selectedMap.maxPlayers} seats, but {room.players.length}{' '}
                        people joined. Choose a larger map.
                      </p>
                    )}
                    {selectedMap.maxPlayers > 6 && (
                      <p className="small muted">
                        Expansion end: {selectedMap.endSize} hotels in one chain, or all active
                        chains safe, after playing a tile.
                      </p>
                    )}
                    {selectedMap.maxPlayers === 6 && selectedMap.endSize !== 41 && (
                      <p className="small muted">
                        Custom-city end: {selectedMap.endSize} hotels in one chain, or all active
                        chains safe.
                      </p>
                    )}
                    {bots > 0 && (
                      <>
                        <label className="field-label" htmlFor="online-difficulty">
                          Computer difficulty
                        </label>
                        <select
                          id="online-difficulty"
                          value={botDifficulty}
                          disabled={!room.features?.includes('difficulty-v1')}
                          onChange={(event) =>
                            setBotDifficulty(event.target.value as BotDifficulty)
                          }
                        >
                          <option value="casual">Casual</option>
                          <option value="standard">Standard</option>
                          <option value="strategist">Strategist</option>
                        </select>
                      </>
                    )}
                    {room.features?.includes('house-rules-v1') && (
                      <HouseRulesControls
                        value={effectiveHouseRules}
                        onChange={setHouseRules}
                        mapTiles={selectedMap.tiles.length}
                        players={
                          publicTable
                            ? selectedSeatLimit
                            : Math.max(1, room.players.length + selectedBots)
                        }
                        hotelSelectionAvailable={room.features?.includes('hotel-roster-v1')}
                        shareSupplyAvailable={room.features?.includes('hotel-stock-v1')}
                        marketFrequencyAvailable={room.features?.includes('market-frequency-v1')}
                      />
                    )}
                    {room.features?.includes('house-rules-v1') &&
                      !room.features?.includes('hotel-roster-v1') && (
                        <p className="small muted">
                          Update the room function to choose hotels online. This server uses the
                          printed seven.
                        </p>
                      )}
                    {room.features?.includes('house-rules-v1') &&
                      !room.features?.includes('market-frequency-v1') && (
                        <p className="small muted">
                          Update the room function for custom market timing online. This server
                          rolls after each complete round.
                        </p>
                      )}
                    {!room.features?.includes('maps-v1') && (
                      <p className="small muted">
                        Update your Supabase room function to enable new maps and difficulty.
                      </p>
                    )}
                    {settings && onSettingsChange && (
                      <div className="setup-privacy">
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.hideOpponentHoldings}
                            onChange={(event) =>
                              onSettingsChange({
                                ...settings,
                                hideOpponentHoldings: event.target.checked,
                              })
                            }
                          />{' '}
                          Hide opponents’ holdings after moves
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={settings.hideStockAvailability}
                            onChange={(event) =>
                              onSettingsChange({
                                ...settings,
                                hideStockAvailability: event.target.checked,
                              })
                            }
                          />{' '}
                          Hide remaining stock counts
                        </label>
                      </div>
                    )}
                  </div>
                  {publicTable && (
                    <>
                      <p className="public-table-note">
                        {unpublished
                          ? 'Your new settings are not published yet. Save them so guests can review the same map and rules.'
                          : 'Your table is listed for 30 minutes after its latest activity. Refresh its listing to keep welcoming players.'}
                      </p>
                      <button
                        className="button secondary full"
                        disabled={busy || room.players.length > selectedSeatLimit}
                        onClick={() =>
                          void run(async () =>
                            onRoom(
                              await configureLobby(room, 'public', {
                                mapId,
                                seatLimit: selectedSeatLimit,
                                botDifficulty,
                                houseRules: effectiveHouseRules,
                              }),
                            ),
                          )
                        }
                      >
                        {unpublished ? 'Publish table settings' : 'Refresh public listing'}{' '}
                        <RefreshCw size={15} />
                      </button>
                    </>
                  )}
                  <button
                    disabled={
                      busy ||
                      unpublished ||
                      room.players.length > selectedSeatLimit ||
                      room.players.length + selectedBots <
                        (room.features?.includes('small-tables-v1') ? 2 : 3)
                    }
                    className="button primary full"
                    onClick={() =>
                      run(async () => {
                        const legacyRules: Partial<typeof effectiveHouseRules> = {
                          ...effectiveHouseRules,
                        };
                        delete legacyRules.hotelChains;
                        delete legacyRules.shareSupply;
                        const rosterRules: Partial<typeof effectiveHouseRules> = {
                          ...effectiveHouseRules,
                        };
                        if (!room.features?.includes('hotel-stock-v1'))
                          delete rosterRules.shareSupply;
                        if (!room.features?.includes('market-frequency-v1')) {
                          delete legacyRules.marketFrequency;
                          delete rosterRules.marketFrequency;
                        }
                        const r = await startRoom(
                          room.code,
                          selectedBots,
                          mapId,
                          botDifficulty,
                          room.features?.includes('house-rules-v1')
                            ? room.features?.includes('hotel-roster-v1')
                              ? rosterRules
                              : legacyRules
                            : undefined,
                        );
                        onRoom(r);
                        onPlay();
                      })
                    }
                  >
                    {busy ? <LoaderCircle className="spin" size={18} /> : 'Start the game'}
                    <ArrowRight size={17} />
                  </button>
                  <p className="small muted center">
                    2008 rules · at least 2 players required
                    {publicTable ? ' · online records require two human players' : ''}
                  </p>
                </>
              ) : (
                <>
                  <div className="inline-note">
                    <LoaderCircle className="spin" size={18} /> Waiting for the host to start…
                  </div>
                  {publicTable && room.lobbyOptions && (
                    <>
                      <MapPreview map={getMap(room.lobbyOptions.mapId)} />
                      <details className="public-table-note">
                        <summary>Review the table rules</summary>
                        <dl>
                          {storyRuleBriefing({
                            mapId: room.lobbyOptions.mapId,
                            players: room.lobbyOptions.seatLimit,
                            houseRules: room.lobbyOptions.houseRules ?? DEFAULT_HOUSE_RULES,
                          }).map((rule) => (
                            <div key={rule.title}>
                              <dt>
                                <strong>{rule.title}</strong>
                              </dt>
                              <dd>{rule.detail}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </>
                  )}
                </>
              )
            ) : (
              <button className="button primary full" onClick={onPlay}>
                Return to your game <ArrowRight size={17} />
              </button>
            )}
            {confirmClose && room.viewerId === room.hostId && room.status === 'playing' ? (
              <div className="online-end-confirm">
                <p>
                  End this game for everyone? The unfinished room will be removed without a result.
                </p>
                <div>
                  <button
                    className="button subtle"
                    disabled={busy}
                    onClick={() => setConfirmClose(false)}
                  >
                    Keep game
                  </button>
                  <button
                    className="button primary exit-game-danger"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await endRoom(room.code);
                        onRoom(null);
                        localStorage.removeItem('aquire.room');
                      })
                    }
                  >
                    End game for everyone
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button danger full"
                disabled={busy}
                onClick={() => {
                  if (room.viewerId === room.hostId && room.status === 'playing') {
                    setConfirmClose(true);
                    return;
                  }
                  void run(async () => {
                    await leaveRoom(room.code);
                    onRoom(null);
                    localStorage.removeItem('aquire.room');
                  });
                }}
              >
                {room.status === 'playing'
                  ? room.viewerId === room.hostId
                    ? 'End this game'
                    : 'Leave this game'
                  : room.status === 'lobby'
                    ? 'Leave this table'
                    : 'Find another table'}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="inline-note">
              <Globe2 size={19} /> Find company or invite your friends.
            </div>
            <div className="segmented">
              <button
                className={tab === 'create' ? 'selected' : ''}
                onClick={() => setTab('create')}
              >
                Create a table
              </button>
              <button className={tab === 'join' ? 'selected' : ''} onClick={() => setTab('join')}>
                Join friends
              </button>
              <button
                className={tab === 'browse' ? 'selected' : ''}
                onClick={() => setTab('browse')}
              >
                Open tables
              </button>
            </div>
            <label className="field-label" htmlFor="online-name">
              Your name
            </label>
            <input
              id="online-name"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A name for the table"
            />
            {tab === 'browse' ? (
              <>
                <div className="lobby-directory-tools">
                  <span>Waiting tables with open seats</span>
                  <button
                    className="text-button"
                    disabled={directoryLoading}
                    onClick={() => void refreshDirectory()}
                  >
                    <RefreshCw size={15} className={directoryLoading ? 'spin' : ''} /> Refresh
                  </button>
                </div>
                {directoryError && (
                  <p className="error-message" role="alert">
                    {directoryError}
                  </p>
                )}
                <div className="open-table-list">
                  {tables.map((table) => {
                    const map = getMap(table.options.mapId);
                    return (
                      <article className="open-table-card" key={table.code}>
                        <button
                          className="lobby-profile-button open-table-heading"
                          aria-label={`View ${table.host.name}’s profile`}
                          disabled={busy}
                          onClick={() => {
                            setSelectedProfile(table.host);
                            setProfileRecord(null);
                            void run(async () =>
                              setProfileRecord(await getOnlineProfile(table.host.id)),
                            );
                          }}
                        >
                          <CharacterAvatar avatar={table.host.avatar} name={table.host.name} />
                          <span>
                            <strong>{table.host.name}’s table</strong>
                            <small>
                              {map.name} · {table.playerCount}/{table.options.seatLimit} players
                              {table.host.country ? ` · ${countryName(table.host.country)}` : ''}
                            </small>
                          </span>
                        </button>
                        <details className="public-table-note">
                          <summary>See the city and rules</summary>
                          <MapPreview map={map} />
                          <dl>
                            {storyRuleBriefing({
                              mapId: map.id,
                              players: table.options.seatLimit,
                              houseRules: table.options.houseRules ?? DEFAULT_HOUSE_RULES,
                            }).map((rule) => (
                              <div key={rule.title}>
                                <dt>
                                  <strong>{rule.title}</strong>
                                </dt>
                                <dd>{rule.detail}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const r = await joinRoom(table.code, name.trim() || 'Investor');
                              onRoom(r);
                              localStorage.setItem('aquire.room', r.code);
                              if (r.game) onPlay();
                            })
                          }
                        >
                          Join {table.host.name} <ArrowRight size={15} />
                        </button>
                      </article>
                    );
                  })}
                </div>
                {!tables.length && !directoryLoading && !directoryError && (
                  <div className="public-table-note">
                    No open tables just now. Create one and invite the next investor to join.
                  </div>
                )}
                <p className="muted small">
                  Only public waiting tables appear here. Listings refresh every minute while
                  this screen is visible.
                </p>
              </>
            ) : tab === 'join' ? (
              <>
                <label className="field-label" htmlFor="join-code">
                  Room code
                </label>
                <input
                  className="code-input"
                  id="join-code"
                  maxLength={6}
                  placeholder="ABCDEF"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="table-visibility">
                  Who can join?
                </label>
                <select
                  id="table-visibility"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
                >
                  <option value="private">Friends with your invite code</option>
                  <option value="public">Anyone · list in Open tables</option>
                </select>
                <div className="edition-card">
                  <Globe2 size={23} />
                  <div>
                    <span className="eyebrow">2008 EDITION</span>
                    <strong>2–12 investors. One unforgettable table.</strong>
                    <p>
                      The map determines the seat limit. Computer opponents can fill empty seats.
                    </p>
                  </div>
                </div>
              </>
            )}
            {tab !== 'browse' && (
              <button
                className="button primary full"
                disabled={busy || (tab === 'join' && code.length !== 6)}
                onClick={connect}
              >
                {busy ? <LoaderCircle className="spin" size={18} /> : <Users size={18} />}{' '}
                {tab === 'create' ? 'Open your table' : 'Take your seat'}
                <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
