import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Award, Crown, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { CHAINS } from '../game/engine';
import type { MatchSummary } from '../lib/matches';
import { money } from '../lib/storage';
import FinalBoard from './FinalBoard';
import { MarketResult, RollDie } from './DiceReveal';
import type { FinalChainSettlement } from '../game/types';
import '../finale.css';

function FinalMarketRoll({ settlement, name, onReveal }: { settlement: FinalChainSettlement; name: string; onReveal: () => void }) {
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    if (!rolling) return;
    const timer = window.setTimeout(onReveal, 1600);
    return () => window.clearTimeout(timer);
  }, [rolling, onReveal]);
  return <div className="final-market-roll" data-testid="final-market-roll" aria-live="polite">
    <span className="eyebrow">ONE CHAIN. ONE FINAL ROLL.</span>
    <h3>{rolling ? `${name}’s fortune is turning…` : `Where will ${name} finish?`}</h3>
    {rolling ? <RollDie label="Market" sides={6} value={settlement.marketDie!} revealed={false} /> : <div className="dice-face final-die-ready" aria-hidden="true">?</div>}
    <p>This roll sets {name}’s share price and shareholder bonuses. Every other chain gets its own roll.</p>
    <button className="button primary" onClick={() => {
      if (rolling || window.matchMedia('(prefers-reduced-motion: reduce)').matches) onReveal();
      else setRolling(true);
    }}>{rolling ? 'Show result' : `Roll for ${name}`} <ArrowRight size={16} /></button>
  </div>;
}

export default function Finale({ match, onHome }: { match: MatchSummary; onHome: () => void }) {
  const [step, setStep] = useState(0);
  const [revealedChain, setRevealedChain] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const chains = match.finalSettlements ?? [];
  const standings = step >= chains.length;
  const settlement = chains[step];
  const chain = CHAINS.find((item) => item.id === settlement?.chain);
  useEffect(() => { setStep(0); setBoardOpen(false); setRevealedChain(null); }, [match.id]);
  const rollRevealed = !settlement?.marketDie || revealedChain === settlement.chain;
  const nextStep = () => { setStep((value) => value + 1); setRevealedChain(null); setBoardOpen(false); };
  return <div className="finale" data-stage={standings ? 'standings' : 'settlement'}>
    <div className="finale-top">
      <button className="text-button" onClick={onHome}><ArrowLeft size={16} /> The clubhouse</button>
      <span className="eyebrow">THE CLOSING BELL · TURN {match.turn}</span>
    </div>
    <div className="finale-hero">
      <div className="finale-glow" />
      <span className="eyebrow">{standings ? 'THE FINAL FORTUNES' : `FINAL SALE ${step + 1} OF ${chains.length}`}</span>
      <h1>{standings ? 'A city to remember.' : `${chain?.name ?? 'Hotel'} takes the stage.`}</h1>
      <p>{standings ? match.endReason : settlement?.marketDie ? 'A fresh market roll for each hotel. Then bonuses and the final sale.' : 'Shareholder bonuses are paid, then every share is sold to the bank.'}</p>
      {chains.length > 0 && <div className="finale-progress" aria-label={`${Math.min(step + 1, chains.length)} of ${chains.length} chains revealed`}>
        {chains.map((item, i) => <span key={item.chain} className={i <= step ? 'lit' : ''} style={{ '--progress-color': CHAINS.find((c) => c.id === item.chain)?.color } as CSSProperties} />)}
      </div>}
    </div>
    {!standings && settlement && chain ? <div className={`finale-reveal ${boardOpen ? 'board-open' : ''}`}>
      <button className="button subtle finale-board-toggle" onClick={() => setBoardOpen((value) => !value)}>{boardOpen ? 'See the payouts' : 'See the board'} <ArrowRight size={15} /></button>
      <FinalBoard match={match} featuredChain={settlement.chain} />
      <section className="settlement-card" key={chain.id} style={{ '--settlement-color': chain.color, '--settlement-light': chain.light } as CSSProperties}>
      <div className="settlement-header">
        <div className="settlement-emblem">{chain.name[0]}</div>
        <div><span className="eyebrow">{settlement.size} HOTELS{rollRevealed ? ` · ${money(settlement.sharePrice)} PER SHARE` : ' · FINAL MARKET AWAITS'}</span><h2>{chain.name}</h2></div>
        <Sparkles size={28} aria-hidden="true" />
      </div>
      {!rollRevealed ? <FinalMarketRoll key={chain.id} settlement={settlement} name={chain.name} onReveal={() => setRevealedChain(chain.id)} /> : <>
      {settlement.marketDie && <div className="final-market-result" role="status"><RollDie label="Market" sides={6} value={settlement.marketDie} revealed /><div><strong>{chain.name}’s final market</strong><MarketResult shift={settlement.marketShift ?? 0} /><span>{money(settlement.sharePrice)} per share · applies to bonuses and sales</span></div></div>}
      <div className="settlement-table" role="table" aria-label={`${chain.name} final payouts`}>
        <div className="settlement-row settlement-head" role="row"><span>Investor</span><span>Shares</span><span>Bonus</span><span>Sale</span><strong>Total</strong></div>
        {[...settlement.players].sort((a, b) => b.total - a.total).map((player) => <div className="settlement-row" role="row" key={player.playerId}>
          <span className="settlement-player"><strong>{player.name}</strong>{settlement.majorityIds.includes(player.playerId) && <small className="shareholder-badge"><Crown size={12} /> {settlement.players.filter((holder) => holder.shares > 0).length === 1 ? 'Sole holder · both bonuses' : settlement.majorityIds.length > 1 ? 'Tied majority · shared bonuses' : 'Majority'}</small>}{settlement.minorityIds.includes(player.playerId) && <small className="shareholder-badge minority">Minority</small>}</span>
          <span>{player.shares}</span><span>{money(player.bonus)}</span><span>{money(player.stockValue)}</span><strong>{money(player.total)}</strong>
        </div>)}
      </div>
      <div className="settlement-next"><span>All {chain.name} shares have been settled.</span><button className="button primary" onClick={nextStep}>{step + 1 === chains.length ? 'Reveal final scores' : 'Next hotel chain'} <ArrowRight size={17} /></button></div>
      </>}
      </section>
    </div> : <>
      <div className="winner-celebration" aria-label="Winner celebration">
        {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i, '--hue': (i * 47) % 360 } as CSSProperties} />)}
        <span className="winner-crown"><Trophy size={40} /></span>
        <span className="eyebrow">THE CITY CHAMPION{match.winnerIds.length > 1 ? 'S' : ''}</span>
        <h2>{match.results.filter((result) => result.rank === 1).map((result) => result.name).join(' & ')} {match.winnerIds.length > 1 ? 'share the crown.' : 'takes the crown.'}</h2>
        <strong>{money(match.results[0]?.total ?? 0)}</strong>
      </div>
      <section className="final-standings"><h2>Final standings</h2><div className="final-standings-list">{match.results.map((result) => <div key={result.playerId} className={result.rank === 1 ? 'champion' : ''}>
        <span>{result.rank === 1 ? <Crown size={20} /> : String(result.rank).padStart(2, '0')}</span><strong>{result.name}</strong><small>{money(result.cashBefore)} cash + {money(result.bonuses)} bonuses + {money(result.stocksValue)} stock</small><b>{money(result.total)}</b>
      </div>)}</div></section>
      <section className="trophy-case"><div className="trophy-title"><Award size={24} /><div><span className="eyebrow">EVERY INVESTOR HAS A STORY</span><h2>The trophy case</h2></div></div><div className="trophy-grid">{match.players.map((player) => <div key={player.id} className="trophy-player"><h3>{player.name}</h3>{(match.awards.filter((award) => award.playerId === player.id).length ? match.awards.filter((award) => award.playerId === player.id) : [{ playerId: player.id, title: 'Persistent Investor', detail: 'Stayed in the game to the closing bell', icon: 'sparkles' as const }]).map((award) => <div className="trophy-award" key={award.title}><span>🏆</span><div><strong>{award.title}</strong><small>{award.detail}</small></div></div>)}</div>)}</div></section>
      <div className="finale-actions">{chains.length > 0 && <button className="button subtle" onClick={() => { setStep(0); setRevealedChain(null); }}><RotateCcw size={16} /> Replay the sell-offs</button>}<button className="button primary" onClick={onHome}>Back to the clubhouse <ArrowRight size={17} /></button></div>
    </>}
  </div>;
}
