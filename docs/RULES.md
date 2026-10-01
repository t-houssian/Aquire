# Aquire · 2008 edition

The reference is the [official Wizards of the Coast rulebook](https://media.wizards.com/2015/downloads/ah/acquire_rules.pdf): ©1999, 2008, production code `30022192000001 EN`. The PDF's original creation date is January 16, 2008; its URL reflects a later upload. Pages 1–6 contain the rules; remaining pages provide reference cards.

## Playing

- Three to six players start with $6,000 and six private tiles. Initial board tiles determine seating (pp. 1–2).
- Place a tile, resolve founding or mergers, optionally buy up to three shares, then draw (pp. 2–5).
- Connections are orthogonal. Founders receive a share only if one remains; an empty bank gives no compensation (p. 2).
- The largest merging chain survives; the mover breaks ties. Resolve acquired chains from largest to smallest. Shareholders keep, sell, or exchange two acquired shares for one survivor share (pp. 3–4).
- Eleven tiles make a chain safe. Safe chains cannot merge together (p. 4).
- The printed FAQ permits a player with no legal placement at the beginning of a turn to reveal and set aside the whole rack, draw six replacements, then continue that turn (p. 5). This includes temporarily blocked tiles.
- After placing a tile, optionally declare the end at 41 tiles or when every active chain is safe. Finish the turn, pay bonuses, liquidate active shares, and compare cash. Ties share victory (p. 5).

## The 2008 reference chart

| Starting share price | Chains and reference colors |
| --- | --- |
| $200 | Worldwide · purple; Sackson · orange |
| $300 | Festival · green; Imperial · gold; American · blue |
| $400 | Continental · red; Tower · gray |

Majority bonuses equal ten share prices; minority bonuses equal five. The complete chart is on pp. 4–5 and 7.

## Application decisions

The interface protects private racks during pass-and-play and online games. Opponents’ holdings and stock details in persistent activity history are hidden by default; a separate preference replaces remaining bank quantities with Available/Sold out and defaults off. Neither changes the 2008 transaction rules. Holdings and the full ledger become visible at game end. Every opponent turn has a public recap of placement, purchases, founding shares, and merger activity; local computer turns pause for acknowledgement. Seeded random state makes local saves and server calculations reproducible.

The 2008 printed board is 12×9, has 108 tiles, and seats 3–6. Thirty-three optional custom maps retain the printed share prices, mergers, and turn sequence. Eighteen six-seat variants include eight new boards with different dimensions: 20×7, 11×17, 14×12, 18×9, 15×13, 15×14, 17×11, and 16×12. Their one-chain end targets range from 41 to 55, roughly scaling with board size. Five maps each seat up to eight, ten, or twelve players, with dimensions as wide as 30×17 or as tall as 23×23. Their one-chain end targets are respectively 61, 81, and 111; on every map, all active chains being safe also permits ending after a tile is played. Every shape remains connected and rotationally symmetric for a fair random opening. These map sizes and end targets are house rules, not claims about the publisher’s 2008 edition.

## Optional house rules

House rules are set before a game and saved with that table; changing defaults in Table preferences affects only future games. The game’s House rules tab shows the active choices. They are off or set to printed 2008 values by default.

- **Hotels and certificates:** Choose any 2–12 chains. The original seven and 25 shares per chain are selected by default. Five optional chains have distinct colors and price tiers: Budgeton starts at $100, Heritage at $200, Riviera at $300, Monarch at $400, and Goldspire at $500 for a two-tile chain. Set 1–100 certificates for each selected chain; founder awards, purchases, merger trades, bank availability, and final settlement honor that supply. The selected roster determines which chains can be founded.
- **Opening:** Place 1–10 random board tiles per investor before dealing six private tiles each. The chosen map must have room for both; smaller maps can therefore cap this below ten. Give each investor $0–$1,000,000 in starting cash (default $6,000).
- **Placement/removal:** Place up to 1–6 tiles per turn (default one), resolving each founding or merger before placing another. You may stop after one placement; the rack refills to six at the end. Optionally remove 0–5 older board tiles during placement, always fewer than the placement limit. An independent tile can be removed; a chain tile can be removed only when the remaining chain stays orthogonally connected and has at least two tiles. Removed tiles are shuffled into the draw bag.
- **Timer:** An optional 5–600-second deadline begins with each turn. When it expires, the remaining decisions are completed automatically using legal computer decisions. Online rooms enforce the deadline on the server; local games enforce it on the device.
- **Privacy:** Hidden money conceals other investors’ cash until the finale. Anonymous buying conceals other portfolios, their market orders, exact bank quantities, and cash. Online responses mask these values, not merely their display. The market still says Available or Sold out; a purchase that exceeds the hidden supply is rejected without changing the game.
- **Share limits and trading:** A normal turn buys 1–10 shares at most (default three). Optional turn trading lets the investor sell up to three held shares, including inactive shares worth $0, at the current price. Each share sold adds one purchase to that turn’s limit. Sales and purchases are validated and applied as one market order.
- **Dividends:** The three printed price groups are Worldwide/Sackson, Festival/Imperial/American, and Continental/Tower. A cluster is full when every selected chain in that price tier is active. Budgeton and Goldspire add their own tiers if selected. After each complete round, a three-sided roll pays on 1 with one full cluster, 1–2 with two, and every roll with three or more. A second equally likely roll chooses only among hotel chains currently on the board; with none active, no hotel is selected. Every complete three shares held in an active selected chain pays one current share price. If that chain has tiles surrounded in all eight directions by its own tiles, all such inside tiles return to the bag after the payout, possibly lowering the chain’s price.
- **Markets:** By default, Market rolls a six-sided die after the dividend decision each round: 1–2 shifts all prices one chart row down, 3–4 stays normal, and 5–6 shifts one row up. Crazy Market uses shifts of −2, −1, 0, 0, +1, +2 for rolls 1–6. An optional frequency changes the roll to before every player's turn (including an opening roll), after every second complete round, or after every third complete round. Dividends still resolve after every complete round; between market rolls, the previous market value holds. Shifts stop at the first and last printed price row. Current prices govern purchases, turn sales, merger cash and bonuses, and dividends; at final liquidation, each active chain gets its own independent market die roll, which sets both its bonus and sale price. Saved results and replay use those same rolls; the game can end in any market. The dice reveal appears at each dividend or market event, while the current market status stays visible beside the board.

The app interprets an isolated placement as completing the placement step, followed by the normal purchase and draw steps. This follows the explicit turn order and buying instructions even though the brief “No Effect” paragraph on p. 4 skips ahead in its wording.

Permanently unplayable tiles connecting two safe chains can be retired and replaced individually. Temporarily unplayable tiles that would found an extra chain remain in the rack while another tile is legal. If no tile in the rack can be played at the beginning of a turn, the player may instead reveal and set aside the entire rack, including temporarily blocked tiles, draw replacements, then play a legal tile. Setup tiles that are orthogonally adjacent remain unincorporated until a later placement joins their group. The rulebook does not specify every exhausted-bag case; the app draws as many replacements as remain, allows a placement pass once the bag is empty, and settles a table when no player can restore a legal move. These are digital continuation safeguards.

Current saves use schema version 2 and `aquire.games.v2`. Earlier saves remain untouched under `aquire.games.v1`; their different rules and price tiers prevent a faithful automatic conversion. They are excluded from the current game's resume list.

Regression coverage lives in `src/game/rules-audit.test.ts` and `e2e/game.spec.ts`. The publisher PDF remains the complete illustrated reference.
