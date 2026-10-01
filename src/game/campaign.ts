import { CHARACTERS } from './characters.ts';
import type { GameConfig, MapId } from './types.ts';

export interface StoryChapter {
  id: string; number: number; title: string; district: string; mapId: MapId; players: number;
  intro: string; victory: string; tip: string; opponents: string[];
}
type ChapterSeed = [string, string, MapId, number, string, string, string];
const chapters: ChapterSeed[] = [
  ['Small change', 'The corner shop', 'duo-pocket-square', 2,
    'Your aunt leaves you a battered hotel ledger and one piece of advice: start small, think big. Penny has already claimed the best chair at the corner café. Win your first table and earn an invitation across town.',
    'Penny slides you a coupon marked ONE FRESH START. The city has noticed its newest investor.',
    'A cheap share can secure both bonuses when you are the only shareholder.'],
  ['A key, a biscuit, a plan', 'Moonlight mews', 'duo-moon-lock', 2,
    'The invitation smells faintly of biscuits. Basil owns the moonlit mews, or at least insists he does. The two courtyards offer separate places to build, until the narrow crossing brings you together.',
    'Basil hands over a brass key and the last biscuit. Both are surprisingly good investments.',
    'Watch which chain will survive before joining the courtyards.'],
  ['The breakfast exchange', 'Market Square', 'four-market-square', 3,
    'Two regulars have turned the breakfast market into a private stock exchange. Moxie talks fast; Vera barely talks at all. You need to beat both before they will put your name on the proper guest list.',
    'Your name goes on the list. Someone has underlined it twice in marmalade.',
    'Three investors make majority contests harder. Count the shares before spending.'],
  ['Lanterns after dark', 'The lantern quarter', 'four-paper-lantern', 3,
    'The next table opens when the lanterns come on. Otto has sworn off reckless spending, and Cleo can hear a merger three streets away. Climb the narrow city without handing either of them the evening bonus.',
    'One lantern stays lit in your honor. The invitation beneath it carries the old boardroom seal.',
    'Keep enough cash to buy after a merger opens the bank again.'],
  ['The old boardroom', 'The original city', 'classic', 4,
    'At last, the original 12×9 city. Percy, Nora and Gus have kept this table for years. They will happily explain their favorite moves after they have used them against you.',
    'Three old regulars raise their cups. You have earned your first seat at the city council.',
    'Growing a hotel is most valuable when its shares work for you.'],
  ['The infinity clause', 'Jade waterfront', 'jade-infinity', 4,
    'A curious clause in the ledger points to two looping waterfronts. Dot knows every bonus, Felix loves a contested majority, and Tilda collects shares like porcelain. There are two routes forward and no easy opponents.',
    'The loops are closed, the ledger balances, and an elevator key falls from the next page.',
    'The best merger is the one whose payout improves your position against the table.'],
  ['Above the clouds', 'The sky palaces', 'cloud-palace', 6,
    'The elevator stops above the clouds. Five eccentric owners greet you from four floating palaces. Below, the city looks small. At this table, every founding share has five people watching it.',
    'Your skyline reaches the clouds. A silver moth lands on a letter addressed to you.',
    'A small minority holding can matter when several investors contest the same chain.'],
  ['A wing and a share', 'The moonlit conservatory', 'lunar-moth', 6,
    'The conservatory hosts a midnight auction. Five new rivals gather beneath enormous moth-shaped wings. The central body links every district, and everyone has a different idea about when to cross it.',
    'The auctioneer rings the bell. Your next invitation is stamped with a very large dragon.',
    'Narrow crossings make the contents of your rack especially valuable.'],
  ['Here be landlords', 'Dragon Spine', 'big-dragon-spine', 8,
    'The dragon district stretches farther than the old ledger can fold. Seven landlords have gathered along its ribs and crests. They agree on almost nothing, except that you have arrived a little too confidently.',
    'Seven signatures certify your place among the great builders. One is just an impressive ink blot.',
    'With eight investors, follow the largest rival payout as closely as your own.'],
  ['The midnight society', 'Moon Mosaic', 'big-moon-mosaic', 8,
    'Five moon courts hide a table belonging to a very peculiar society. The dress code is formal; the tactics are not. Seven strangers offer you a chair and absolutely no useful advice.',
    'They make you an honorary member. Your badge is a tiny umbrella for your portfolio.',
    'Protect a bonus lead when the bank is running low on certificates.'],
  ['A storm of suits', 'Thunderbird heights', 'mega-thunderbird', 10,
    'Thunder rolls through the feathered skyline. Nine rivals arrive with umbrellas, clipboards and implausible hats. The final invitation is on this table. To take it, you must finish above every one of them.',
    'The storm clears. Behind the clouds stands the World Tree, and eleven empty chairs await their owners.',
    'A safe chain can still grow. Balance its final value against cash you need now.'],
  ['The city is yours', 'The World Tree summit', 'max-world-tree', 12,
    'Your battered ledger opens to its last page. Eleven legendary investors take their places among the roots and canopies of the biggest city. No favors, no easy seats: win the summit and write your own ending.',
    'Grandpa Goldleaf closes the ledger, then gives it back. There is a new page inside. The city is yours—and the next story is yours to build.',
    'Watch the end conditions. Winning the table means knowing when to ring the closing bell.'],
];
let offset = 0;
export const STORY_CHAPTERS: readonly StoryChapter[] = chapters.map(([title, district, mapId, players, intro, victory, tip], index) => {
  const opponents = CHARACTERS.slice(offset, offset + players - 1).map((character) => character.id);
  offset += players - 1;
  return { id: `chapter-${index + 1}`, number: index + 1, title, district, mapId, players, intro, victory, tip, opponents };
});
export const getStoryChapter = (id?: string) => STORY_CHAPTERS.find((chapter) => chapter.id === id);
export function storyGameConfig(chapterId: string, name: string, seed: number): GameConfig {
  const chapter = getStoryChapter(chapterId);
  if (!chapter) throw new Error('Choose a chapter from The Long Game.');
  const playerId = 'story-player';
  return {
    id: `story-${chapter.number}-${seed.toString(36)}-${Date.now().toString(36)}`,
    seed, mapId: chapter.mapId, mode: 'classic', botDifficulty: 'strategist',
    campaign: { version: 1, chapterId, playerId },
    // Deliberately independent of free-play preferences: every attempt faces the same rules.
    houseRules: {},
    players: [{ id: playerId, name: name.trim() || 'You', isBot: false }, ...chapter.opponents.map((id) => {
      const character = CHARACTERS.find((candidate) => candidate.id === id)!;
      return { id: `story-${id}`, name: character.name, isBot: true, characterId: id };
    })],
  };
}
