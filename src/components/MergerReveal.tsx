import type { CSSProperties } from 'react';
import { ArrowRight, Crown, Sparkles } from 'lucide-react';
import { CHAINS, getHouseRules, type GameState, type MergerPayout } from '../game/engine';
import { money } from '../lib/storage';
import Modal from './Modal';
import '../merger-reveal.css';

export default function MergerReveal({ payout, game, viewerId, onContinue, remaining }: {
  payout: MergerPayout; game: GameState; viewerId: string; onContinue: () => void; remaining: number;
}) {
  const chain = CHAINS.find((chain) => chain.id === payout.chain)!;
  const survivor = CHAINS.find((chain) => chain.id === payout.survivor)!;
  const rules = getHouseRules(game);
  const privateMoney = rules.hiddenMoney || rules.anonymousBuying;
  const holders = payout.players.filter((player) => (player.shares ?? 0) > 0).length;
  return <Modal title={`${chain.name} joins ${survivor.name}`} onClose={onContinue} wide>
    <div className="merger-reveal" style={{ '--payout-color': chain.color, '--payout-light': chain.light } as CSSProperties} data-testid="merger-reveal">
      <div className="merger-payout-hero">
        <span className="merger-payout-emblem">{chain.abbreviation}</span>
        <div><span className="eyebrow">SHAREHOLDER BONUSES</span><h3>A little investment. A big moment.</h3><p>{payout.size} hotels · {money(payout.sharePrice)} per share</p></div>
        <Sparkles size={25} aria-hidden="true" />
      </div>
      <p className="merger-payout-intro">{chain.name} shareholder bonuses have been paid. Selling, trading, or keeping shares comes next.</p>
      <div className="merger-payout-table" role="table" aria-label={`${chain.name} shareholder bonuses`}>
        <div className="merger-payout-row merger-payout-head" role="row"><span role="columnheader">Investor</span><span role="columnheader">Shares</span><span role="columnheader">Bonus paid</span></div>
        {payout.players.map((player) => {
          const own = player.playerId === viewerId;
          const showMoney = !privateMoney || own;
          const showShares = !rules.anonymousBuying || own;
          const showBadge = !rules.anonymousBuying;
          return <div className="merger-payout-row" role="row" key={player.playerId}>
            <div role="cell"><strong>{game.players.find((p) => p.id === player.playerId)?.name ?? 'Investor'}</strong>
              {showBadge && payout.majorityIds.includes(player.playerId) && <small><Crown size={12} /> {holders === 1 ? 'Sole holder · both bonuses' : payout.majorityIds.length > 1 ? 'Tied majority · shared bonuses' : 'Majority'}</small>}
              {showBadge && payout.minorityIds.includes(player.playerId) && <small>{payout.minorityIds.length > 1 ? 'Tied minority' : 'Minority'}</small>}
            </div>
            <span role="cell">{showShares && player.shares !== null ? player.shares : 'Private'}</span>
            <strong role="cell" className={showMoney && player.bonus ? 'paid' : ''}>{showMoney && player.bonus !== null ? money(player.bonus) : 'Private'}</strong>
          </div>;
        })}
      </div>
      <div className="merger-payout-footer"><span>{remaining ? `${remaining} more merger update${remaining === 1 ? '' : 's'} to see` : 'Bonuses are already in each investor’s cash.'}</span><button className="button primary" onClick={onContinue}>{remaining ? 'Next update' : 'Continue'} <ArrowRight size={16} /></button></div>
    </div>
  </Modal>;
}
