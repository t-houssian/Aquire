/** Original cast. Only the small character ID travels with a saved/online player. */
export type BotStyle = 'builder' | 'broker' | 'collector' | 'guardian' | 'raider' | 'planner';
export const STYLE_NAMES: Record<BotStyle, string> = {
  builder: 'Skyline builder', broker: 'Bonus broker', collector: 'Share collector',
  guardian: 'Cash guardian', raider: 'Majority raider', planner: 'Patient planner',
};
export interface Character {
  id: string; name: string; title: string; quote: string; style: BotStyle; portrait: number; royal?: boolean;
}
const cast: [string, string, string, BotStyle][] = [
  ['Penny Pinch', 'The coupon empress', 'I brought exact change. And a plan.', 'guardian'],
  ['Basil Biscuit', 'The landlord of lunch', 'That building pairs beautifully with a majority.', 'builder'],
  ['Moxie Marmalade', 'The breakfast baron', 'Spread the risk. Keep the toast.', 'collector'],
  ['Vera Velvet', 'The quiet bidder', 'My inside voice says buy.', 'planner'],
  ['Otto Overdraft', 'The reformed spender', 'New tie. Same spreadsheet.', 'guardian'],
  ['Cleo Clatter', 'The midnight negotiator', 'That sound? Just my shares arriving.', 'broker'],
  ['Percy Pockets', 'The waistcoat investor', 'There is a reserve in every pocket.', 'guardian'],
  ['Nora Numbers', 'The human abacus', 'I counted twice. You are still behind.', 'planner'],
  ['Gus Gooseberry', 'The rooftop gardener', 'A little growth does wonders.', 'builder'],
  ['Dot Dividend', 'The bonus whisperer', 'The small print is my favorite print.', 'broker'],
  ['Felix Fizz', 'The sparkling speculator', 'A little pressure makes a lovely pop.', 'raider'],
  ['Tilda Teacup', 'The porcelain collector', 'One more share for the cabinet.', 'collector'],
  ['Jasper Jetstream', 'The cloud commuter', 'I prefer a portfolio with a view.', 'builder'],
  ['Bea Belltower', 'The punctual rival', 'Your majority is running late.', 'raider'],
  ['Waldo Waffles', 'The brunch accountant', 'Every square deserves a strategy.', 'planner'],
  ['Cora Coinflip', 'The careful gambler', 'Lucky? I prefer well prepared.', 'guardian'],
  ['Iggy Inkpot', 'The fine-print fanatic', 'I signed the margin, too.', 'broker'],
  ['Faye Firefly', 'The neon dealmaker', 'Follow the glow. Mind the merger.', 'broker'],
  ['Monty Mothball', 'The vintage magnate', 'This waistcoat has survived six takeovers.', 'collector'],
  ['Lulu Ledger', 'The balancing act', 'Both sides of this deal favor me.', 'planner'],
  ['Rex Receipt', 'The return-policy king', 'I kept the receipt for your skyline.', 'raider'],
  ['Ada Apricot', 'The orchard architect', 'Today a seed. Tomorrow the whole avenue.', 'builder'],
  ['Quincy Quill', 'The dragon correspondent', 'I have a headline ready for this merger.', 'broker'],
  ['Suki Skylark', 'The penthouse poet', 'Some people collect words. I collect roofs.', 'builder'],
  ['Bram Brass', 'The brass-button boss', 'Polish the shoes. Protect the reserve.', 'guardian'],
  ['Mina Moonbeam', 'The night-shift analyst', 'I do my best counting after sunset.', 'planner'],
  ['Hugo Hush', 'The silent shareholder', '...', 'collector'],
  ['Zelda Zip', 'The express investor', 'Your lead had a lovely visit.', 'raider'],
  ['Alfie Alloy', 'The scrapyard sovereign', 'I see potential. And a two-for-one exchange.', 'broker'],
  ['Petra Parasol', 'The rainy-day rich', 'My reserve has its own umbrella.', 'guardian'],
  ['Dino Decaf', 'The unhurried tycoon', 'No rush. The bonus will find me.', 'planner'],
  ['Esme Escrow', 'The velvet-rope banker', 'I can put your ambition on hold.', 'raider'],
  ['Nico Nightjar', 'The midnight collector', 'That share looks better in my portfolio.', 'collector'],
  ['Winnie Windfall', 'The weather watcher', 'I packed for a change in the market.', 'broker'],
  ['Arlo Archway', 'The doorway designer', 'Every hotel begins with an entrance.', 'builder'],
  ['Rita Raincheck', 'The patient purchaser', 'I will take that opportunity now, thank you.', 'planner'],
  ['Sable Storm', 'The lightning accountant', 'A forecast is just a spreadsheet with clouds.', 'planner'],
  ['Bertie Boom', 'The thunder enthusiast', 'Was that thunder, or my portfolio?', 'builder'],
  ['Opal Overcoat', 'The all-weather investor', 'Every pocket is waterproof.', 'guardian'],
  ['Clyde Clipboard', 'The checklist champion', 'Acquire skyline. Check.', 'collector'],
  ['Yara Yodel', 'The peak negotiator', 'My offer has an excellent echo.', 'broker'],
  ['Finley Flash', 'The camera-ready rival', 'Smile. Your majority is in the picture.', 'raider'],
  ['Gilda Gilt', 'The golden archivist', 'I never throw a useful certificate away.', 'collector'],
  ['Pip Paperclip', 'The merger specialist', 'I like bringing things together.', 'broker'],
  ['Vito Vellum', 'The blueprint baron', 'I drew this ending in pencil.', 'builder'],
  ['Duchess Dime', 'The smallest big spender', 'A fortune begins with one very stubborn dime.', 'guardian'],
  ['Professor Par', 'The chalkboard shark', 'There will be a test. It is happening now.', 'planner'],
  ['Madame Meringue', 'The sweet takeover', 'Let the deal rise before you serve it.', 'broker'],
  ['Captain Compound', 'The interest explorer', 'Steady course. Growing returns.', 'builder'],
  ['Dr. Dealgood', 'The portfolio physician', 'I prescribe a healthy majority.', 'raider'],
  ['Lady Liquidity', 'The cash-flow countess', 'A little breathing room is a luxury.', 'guardian'],
  ['Baron Bookvalue', 'The well-read rival', 'I know how this chapter ends.', 'collector'],
  ['Mister Monopolythe', 'The stone-faced bidder', 'I am remarkably difficult to move.', 'planner'],
  ['Count Cashmere', 'The soft-spoken closer', 'A takeover should feel luxurious.', 'broker'],
  ['Queen Quorum', 'The boardroom monarch', 'I believe we have enough votes.', 'raider'],
  ['Grandpa Goldleaf', 'The final landlord', 'I planted this city. Show me what you can grow.', 'builder'],
];
// Each later challenge gets its own cast. Names and faces never repeat in the story.
const firstNames = ['Agatha', 'Barnaby', 'Cosmo', 'Delia', 'Ernest', 'Flora', 'Gordon', 'Hazel', 'Indigo', 'Jolene', 'Klaus', 'Lottie', 'Magnus', 'Nell', 'Orson', 'Prudence', 'Roscoe', 'Sylvie', 'Tobias', 'Una', 'Winston'];
const surnames = ['Pickleworth', 'Buttonbean', 'Snickerdoodle', 'Tumbleton', 'Pepperpot', 'Doodlebank', 'Crumpet', 'Fiddlestock', 'Noodlewick', 'Jinglepocket', 'Bumbershoot', 'Snoozewell', 'Wobblebottom', 'Pumpernickel', 'Quackenbush', 'Moonwallet'];
const styles: BotStyle[] = ['builder', 'broker', 'collector', 'guardian', 'raider', 'planner'];
const titles = ['The skyline sculptor', 'The takeover tailor', 'The certificate curator', 'The rainy-day banker', 'The chair-stealing bidder', 'The long-range schemer'];
const quotes = ['I put a rooftop on my rooftop.', 'I brought two shares and a very persuasive hat.', 'My filing cabinet has its own penthouse.', 'My emergency fund has an emergency fund.', 'That majority looked lonely. I joined it.', 'I penciled in your surprise three turns ago.'];
const laterCast: Character[] = Array.from({ length: 332 }, (_, i) => ({
  id: `rival-${String(i + 1).padStart(3, '0')}`, name: `${firstNames[i % firstNames.length]} ${surnames[Math.floor(i / firstNames.length)]}`,
  title: titles[i % 6], quote: quotes[(i + Math.floor(i / 6)) % 6], style: styles[i % 6], portrait: cast.length + i,
}));
export const ROYAL_CHARACTERS: readonly Character[] = [
  ['Queen Aurelia', 'The gilded strategist'], ['King Crumpet III', 'The biscuit throne'],
  ['Queen Velvetine', 'The velvet veto'], ['King Midas Muffin', 'The golden breakfast'],
  ['Queen Checkmate', 'The crown collector'], ['King Cedric Cash', 'The royal reserve'],
  ['Queen Marmalady', 'The sovereign spread'], ['King Quackalot', 'The duck of dividends'],
  ['Queen Saffron', 'The spice of speculation'], ['King Ledgerloin', 'The knight of numbers'],
  ['Queen Goldspira', 'The final crown'],
].map(([name, title], i) => ({ id: `royal-${i + 1}`, name, title, quote: ['The crown comes with a spreadsheet.', 'My moat is made of working capital.', 'Royalty is earned. So is this majority.'][i % 3], style: styles[i % 6], portrait: 388 + i, royal: true }));
export const CHARACTERS: readonly Character[] = [
  ...cast.map(([name, title, quote, style], index) => ({ id: `cast-${String(index + 1).padStart(2, '0')}`, name, title, quote, style, portrait: index })),
  ...laterCast, ...ROYAL_CHARACTERS,
];
export const getCharacter = (id?: string) => CHARACTERS.find((character) => character.id === id);
/** Shuffle in memory; royal guests only enter free play after the story reward. */
export function pickCharacters(count: number, seed: number, royalsUnlocked = false): Character[] {
  const pool = CHARACTERS.filter((character) => royalsUnlocked || !character.royal);
  let rng = seed >>> 0;
  for (let i = pool.length - 1; i > 0; i--) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const j = rng % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}
export function botPersonality(id?: string) {
  const character = getCharacter(id);
  const neutral = { founding: 1, growth: 1, network: 1, denial: 1, reserve: 600, tradeReserve: 1800 };
  if (!character) return neutral;
  const styles: Record<BotStyle, typeof neutral> = {
    builder: { ...neutral, founding: 1.12, growth: 1.12, reserve: 500 },
    broker: { ...neutral, founding: 1.05, denial: 1.12, tradeReserve: 1600 },
    collector: { ...neutral, growth: 1.08, denial: 1.08, reserve: 500 },
    guardian: { ...neutral, reserve: 950, tradeReserve: 2200 },
    raider: { ...neutral, denial: 1.25, network: 1.08, reserve: 550 },
    planner: { ...neutral, network: 1.18, reserve: 750, tradeReserve: 2000 },
  };
  return { ...styles[character.style], network: styles[character.style].network + character.portrait % 7 * 0.015,
    reserve: styles[character.style].reserve + character.portrait % 5 * 25 };
}
