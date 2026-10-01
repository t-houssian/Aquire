import type { GameState, HouseRules } from '../game/types';
import { DEFAULT_HOUSE_RULES, validateHouseRules } from '../game/engine';
import { recordStoryResult } from './campaign';
import { summarizeMatch, type MatchSummary } from './matches';
export interface SavedGame {
  game: GameState;
  kind: 'solo' | 'local';
  updatedAt: string;
}
export interface Settings {
  sound: boolean;
  speed: number;
  hints: boolean;
  hideOpponentHoldings: boolean;
  hideStockAvailability: boolean;
  sidebarCollapsed: boolean;
  houseRules: HouseRules;
}
const DEFAULT_SETTINGS: Settings = {
  sound: false,
  speed: 850,
  hints: true,
  hideOpponentHoldings: true,
  hideStockAvailability: false,
  sidebarCollapsed: false,
  houseRules: { ...DEFAULT_HOUSE_RULES },
};
const SAVE_KEY = 'aquire.games.v2';
const MATCH_KEY = 'aquire.matches.v1';
export function readMatches(): MatchSummary[] {
  try {
    const data = JSON.parse(localStorage.getItem(MATCH_KEY) || '[]');
    return Array.isArray(data) ? data.filter((m) => m?.id && Array.isArray(m.results) && Array.isArray(m.players)).slice(0, 100) : [];
  } catch { return []; }
}
export function archiveMatch(game: GameState, source: MatchSummary['source']): void {
  const prior = readMatches();
  const original = prior.find((match) => match.id === game.id);
  const summary = { ...summarizeMatch(game, source), endedAt: original?.endedAt ?? new Date().toISOString() };
  const next = [summary, ...prior.filter((match) => match.id !== game.id)].slice(0, 100);
  localStorage.setItem(MATCH_KEY, JSON.stringify(next));
}
export function readGames(): SavedGame[] {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    const valid = data.filter(
          (s) =>
            s?.game?.version === 2 &&
            s.game.ruleset === '2008' &&
            s.game.mode === 'classic' &&
            Array.isArray(s.game.players) &&
            s.game.board &&
            Array.isArray(s.game.bag) &&
            Array.isArray(s.game.logs) &&
            s.game.bank &&
            ['solo', 'local'].includes(s.kind),
        ) as SavedGame[];
    const active = valid.filter((save) => {
          if (save.game.phase !== 'ended') return true;
          try { recordStoryResult(save.game); archiveMatch(save.game, 'local'); return false; }
          catch { return true; }
        });
    if (active.length !== data.length) localStorage.setItem(SAVE_KEY, JSON.stringify(active.slice(0, 24)));
    return active;
  } catch {
    return [];
  }
}
export function readLegacyGameCount(): number {
  try {
    const old = JSON.parse(localStorage.getItem('aquire.games.v1') || '[]');
    return Array.isArray(old) ? old.filter((s) => s?.game?.version === 1).length : 0;
  } catch {
    return 0;
  }
}
export function saveGame(game: GameState, kind: SavedGame['kind']) {
  const saves = readGames().filter((s) => s.game.id !== game.id);
  if (game.phase === 'ended') {
    recordStoryResult(game);
    archiveMatch(game, 'local');
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves.slice(0, 24)));
    return;
  }
  saves.unshift({ game, kind, updatedAt: new Date().toISOString() });
  localStorage.setItem(SAVE_KEY, JSON.stringify(saves.slice(0, 24)));
}
export function removeSavedGame(gameId: string): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(readGames().filter((save) => save.game.id !== gameId)));
}
export function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('aquire.settings.v1') || '{}');
    return {
      sound: typeof saved?.sound === 'boolean' ? saved.sound : DEFAULT_SETTINGS.sound,
      speed: [220, 850, 1400].includes(saved?.speed) ? saved.speed : DEFAULT_SETTINGS.speed,
      hints: typeof saved?.hints === 'boolean' ? saved.hints : DEFAULT_SETTINGS.hints,
      // Older builds defaulted to visible holdings. Migrate that implicit choice once;
      // a deliberate choice made in this version is retained by the version marker.
      hideOpponentHoldings: saved?.privacyVersion === 2
        ? saved.hideOpponentHoldings !== false : true,
      hideStockAvailability: saved?.hideStockAvailability === true,
      sidebarCollapsed: saved?.sidebarCollapsed === true,
      houseRules: validateHouseRules(saved?.houseRules),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(settings: Settings) {
  localStorage.setItem('aquire.settings.v1', JSON.stringify({ ...settings, privacyVersion: 2 }));
}
export function money(value: number) {
  return '$' + value.toLocaleString('en-US');
}
let audioContext: AudioContext | null = null;
export function playTone(success = false) {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(success ? 660 : 390, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      success ? 880 : 260,
      audioContext.currentTime + 0.08,
    );
    gain.gain.setValueAtTime(0.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.16);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.17);
  } catch {
    /* Audio is optional on devices without Web Audio. */
  }
}
