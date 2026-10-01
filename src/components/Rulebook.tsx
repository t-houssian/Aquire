import { useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  HandCoins,
  Layers3,
  Landmark,
  Trophy,
  Search,
  ChevronDown,
} from 'lucide-react';
import { RULEBOOK_URL } from '../game/engine';
export { RULEBOOK_URL };
const sections = [
  {
    icon: Layers3,
    title: 'Your turn, in three moves',
    text: 'Place one tile, buy up to three shares, then refill your rack. Choose a highlighted tile from your hand and confirm its location. Buying is optional; mix shares across any active chains. You start with six tiles and $6,000.',
  },
  {
    icon: Building2,
    title: 'Build something bigger',
    text: 'Only horizontal and vertical neighbors connect. Adjacent tiles placed during setup remain unincorporated. Later, a newly placed tile joining that group founds a chain; choose an available name and receive a free share. If no stock remains, you receive no founder’s bonus. Growing a chain raises its stock price.',
  },
  {
    icon: Landmark,
    title: 'Seven chains. Finite opportunities.',
    text: 'Each chain has just 25 shares. No eighth chain can be founded, so a tile that would create one must wait. A chain with 11 or more hotels is safe: it can grow and acquire smaller chains, but cannot be acquired. A tile connecting two safe chains is permanently blocked.',
  },
  {
    icon: HandCoins,
    title: 'The art of the merger',
    text: 'A tile connecting chains triggers a merger. The largest chain survives, using sizes before the connecting tile. The player making the merger breaks ties. Resolve acquired chains from largest to smallest, choosing the order for ties. Shareholder bonuses are paid before each chain’s stock is resolved.',
  },
  {
    icon: HandCoins,
    title: 'Keep, sell, or trade',
    text: 'Starting with the player who made the merger, each investor decides what to do with the acquired chain’s shares. Sell at its price before the merger, exchange two acquired shares for one available survivor share, or keep shares in case the chain returns. You can combine all three. Outside a merger, active shares can be sold only when the optional turn-trading house rule is enabled.',
  },
  {
    icon: Trophy,
    title: 'Know when to call it',
    text: 'After placing a tile on your turn, you can declare the end when a chain reaches 41 hotels, or all active chains are safe. Finish your turn first. Each active chain pays its bonuses, then all active stock is cashed out. Inactive stock is worthless. The most cash wins; ties share the victory.',
  },
  {
    icon: Layers3,
    title: 'Blocked tiles and the 2008 rack exchange',
    text: 'A tile that would merge two safe chains is permanently unplayable and can be turned in face up for a replacement. A tile that would found another chain while every chain is active is temporarily unplayable; keep it if another tile can be played. At the beginning of a turn, if none of your rack can be played, the 2008 FAQ lets you reveal and set aside the entire rack, including temporarily blocked tiles, and draw six new tiles. Play a legal replacement and continue your turn.',
  },
  {
    icon: Landmark,
    title: 'Majority and minority bonuses',
    text: 'The largest shareholder receives ten times the share price; the second largest receives five times. A sole shareholder collects both bonuses. A tie for majority pools both bonuses; a tie for minority splits the minority bonus. Each tied payout rounds up to the nearest $100. Players holding no shares receive nothing. The printed 2008 edition seats three to six players. This app also offers a two-player house variant with the same shareholder rules; there is no additional bank investor.',
  },
  {
    icon: Layers3,
    title: 'Custom city maps',
    text: 'The printed 12×9 board remains the default. Seventy-nine optional maps use different dimensions and shapes: fifteen tiny cities for two, fifteen small cities for four, twenty-eight for six, and seven each for eight, ten and twelve. The tiny and small cities use 21- and 31-hotel end targets. Six-seat custom boards with more tiles may have a later one-chain end target, shown at setup. The larger tiers end at 61, 81, or 111 hotels in one chain; on every board, all active chains being safe also permits ending after a tile is played. These are house-made map rules. The seven printed chains, 25 shares each, and printed prices remain the default.',
  },
  {
    icon: Landmark,
    title: 'Hotel roster and share supply',
    text: 'House rules can select any two to twelve chains and set 1–100 shares for each selected chain. The seven printed chains with 25 shares each are the default. Budgeton costs one price tier below Worldwide and Sackson; Heritage matches Worldwide; Riviera matches Festival; Monarch matches Tower; Goldspire costs one tier above Tower. Founder shares, purchases, mergers, dividends, and final payouts all use the chosen roster and supplies.',
  },
  {
    icon: Layers3,
    title: 'Opening and turn house rules',
    text: 'A new table may start with 1–10 random board tiles per player, provided six private tiles can still be dealt, and with $0–$1,000,000 per investor. A turn may place up to six tiles, resolving each founding or merger before the next placement, then refill the rack to six. You may finish placing after one tile. If enabled, you may also remove up to five older tiles during placement, always fewer than the placement limit. A chain tile can be removed only when the chain stays connected and at least two tiles large; removed tiles return to the bag.',
  },
  {
    icon: HandCoins,
    title: 'Trading, private orders, and the turn clock',
    text: 'Set the normal purchase limit from one to ten shares. Turn trading allows selling up to three shares, including inactive shares worth $0, at current market price; each sale permits one extra purchase. Hidden money conceals other players’ cash. Anonymous buying conceals purchases, other portfolios, exact bank counts, and cash until the finale. An optional 5–600-second turn clock automatically completes unfinished decisions when time runs out.',
  },
  {
    icon: Landmark,
    title: 'Dividends and moving markets',
    text: 'A full cluster means every selected chain in one price group is active. The printed groups are Worldwide/Sackson, Festival/Imperial/American, and Continental/Tower; custom hotels join the matching tier, while Budgeton and Goldspire form their own tiers. After all players take a turn, a three-sided dividend roll succeeds on 1 with one full cluster, 1–2 with two, and always with three or more. A second roll selects only a hotel chain currently on the board; with no active chains, no hotel is selected. Each complete three shares in an active selected chain earns one current share price. All fully surrounded inside tiles in that chain then return to the bag. Market rolls can happen after each full round, before every player’s turn, or after every second or third round. Market makes prices one chart row low, normal, or one row high; Crazy Market uses two low, one low, normal, one high, or two high. The current row applies to purchases, sales, merger settlements, and dividends. At final scoring, roll independently for each active chain: that roll sets its bonus and sale price. Each roll and payout is revealed in order and saved for replay.',
  },
];
export default function Rulebook({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState('');
  const filtered = sections.filter((s) =>
    (s.title + ' ' + s.text).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`rulebook ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="page-heading">
          <span className="eyebrow">THE 2008 EDITION</span>
          <h1>
            A few rules.
            <br />
            <em>A world of possibilities.</em>
          </h1>
          <p className="muted">Everything you need to make your first move.</p>
        </div>
      )}
      <div className="rule-intro">
        <div className="rule-intro-icon">
          <Building2 size={29} />
        </div>
        <div>
          <h3>Build. Invest. Acquire.</h3>
          <p>Your hotels shape the board. Your investments win the game.</p>
        </div>
      </div>
      <label className="search-field">
        <Search size={18} />
        <input
          aria-label="Search rules"
          placeholder="Find a rule, like mergers or bonuses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="rules-list">
        {filtered.map((s, i) => (
          <details key={s.title} open={query ? true : undefined}>
            <summary>
              <s.icon size={19} />
              <span>{s.title}</span>
              <span className="rule-number">0{i + 1}</span>
              <ChevronDown size={16} />
            </summary>
            <p>{s.text}</p>
          </details>
        ))}
        {!filtered.length && (
          <p className="muted">No rules found. Try “tile”, “stock”, or “merger”.</p>
        )}
      </div>
      <div className="price-reference">
        <h3>Your stock price reference</h3>
        <p className="small muted">Printed base price per share · optional markets can move the active price</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Chain size</th>
                <th>Worldwide / Sackson</th>
                <th>Festival / Imperial / American</th>
                <th>Continental / Tower</th>
              </tr>
            </thead>
            <tbody>
              {['2', '3', '4', '5', '6–10', '11–20', '21–30', '31–40', '41+'].map((size, i) => (
                <tr key={size}>
                  <td>{size} hotels</td>
                  <td>${200 + i * 100}</td>
                  <td>${300 + i * 100}</td>
                  <td>${400 + i * 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <a className="source-link" href={RULEBOOK_URL} target="_blank" rel="noreferrer">
        Read the official 2008 rulebook <ArrowUpRight size={16} />
      </a>
      <p className="small muted">
        Based on Sid Sackson’s Acquire. Printed 2008 rules are the default; house rules are optional.
        Tile racks stay private, and optional privacy settings can conceal money and purchases.
      </p>
    </div>
  );
}
