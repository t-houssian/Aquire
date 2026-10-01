import { useEffect, useState } from 'react';
import { ArrowRight, Coins, Dices, TrendingDown, TrendingUp } from 'lucide-react';
import type { DiceRollReport, HouseRules } from '../game/types';
import { CHAINS } from '../game/engine';
import Modal from './Modal';
import '../dice-reveal.css';

export function MarketResult({ shift }: { shift: number }) {
  return <span className={`dice-market-result ${shift < 0 ? 'low' : shift > 0 ? 'high' : 'normal'}`}>
    {shift < 0 ? <TrendingDown size={18} /> : shift > 0 ? <TrendingUp size={18} /> : <span className="dice-market-equal">=</span>}
    {shift === 0 ? 'Normal prices' : `${Math.abs(shift)} row${Math.abs(shift) === 1 ? '' : 's'} ${shift < 0 ? 'lower' : 'higher'}`}
  </span>;
}

export function RollDie({ label, sides, value, revealed }: { label: string; sides: number; value: number | null; revealed: boolean }) {
  return <div className="dice-roll">
    <div className={`dice-face ${!revealed && value !== null ? 'rolling' : ''} ${value === null ? 'not-rolled' : ''}`} aria-hidden="true">
      {revealed ? value ?? '–' : value === null ? '–' : '?'}
    </div>
    <span>{label} <small>d{sides}</small></span>
  </div>;
}

export default function DiceReveal({ report, rules, onContinue }: {
  report: DiceRollReport;
  rules: HouseRules;
  onContinue: () => void;
}) {
  const [revealed, setRevealed] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (revealed) return;
    const timer = window.setTimeout(() => setRevealed(true), 1100);
    return () => window.clearTimeout(timer);
  }, [revealed]);
  const showDividend = rules.dividends && report.kind === 'round';
  const selected = CHAINS.find((chain) => chain.id === report.chain);
  const dividendSuccess = report.stockDie !== null;
  const dividendPaid = report.dividendPaid ?? 0;
  const privatePayout = rules.hiddenMoney || rules.anonymousBuying || report.dividendPaid === undefined;
  const fullClusters = report.fullClusters ?? 0;
  const marketRolled = report.marketDie !== null;
  const title = report.kind === 'opening' ? 'The opening market' : report.kind === 'turn' ? 'The market moves' : `Round ${report.round} closes`;

  return <Modal title={title} onClose={onContinue} wide>
    <div className="dice-reveal" data-testid="dice-reveal" data-revealed={revealed}>
      <div className="dice-reveal-hero">
        <span className="eyebrow"><Dices size={15} /> {report.kind === 'opening' ? 'BEFORE THE FIRST TURN' : report.kind === 'turn' ? 'BEFORE THE NEXT INVESTOR' : 'EVERY INVESTOR HAS PLAYED'}</span>
        <h3>{revealed ? 'The dice have spoken.' : 'The dice are rolling…'}</h3>
        <div className="dice-rolls">
          {showDividend && <RollDie label="Dividend" sides={3} value={report.dividendDie} revealed={revealed} />}
          {showDividend && report.stockDie !== null && <RollDie label="Hotel" sides={report.stockDieSides ?? rules.hotelChains.length} value={report.stockDie} revealed={revealed} />}
          {marketRolled && <RollDie label="Market" sides={6} value={report.marketDie} revealed={revealed} />}
          {!showDividend && !marketRolled && <span className="dice-no-roll">No dice were needed this turn.</span>}
        </div>
      </div>
      <div className={`dice-outcomes ${revealed ? 'revealed' : ''}`} aria-live="polite" aria-hidden={!revealed}>
        {showDividend && <div className={`dice-outcome ${dividendSuccess ? 'paid' : 'quiet'}`}>
          <span className="dice-outcome-icon"><Coins size={19} /></span>
          <div>
            <span className="eyebrow">DIVIDENDS</span>
            {report.stockDieSides === 0 ? <><strong>No hotels on the board</strong><p>No hotel is selected and no dividend is paid.</p></>
              : fullClusters === 0 ? <><strong>No dividend roll</strong><p>No complete hotel cluster is on the board yet.</p></>
              : !dividendSuccess ? <><strong>No dividend this round</strong><p>Rolled {report.dividendDie}; {fullClusters} full cluster{fullClusters === 1 ? '' : 's'} needed a roll of {fullClusters === 1 ? '1' : `1–${Math.min(fullClusters, 3)}`}.</p></>
              : <><strong>{selected?.name ?? 'A hotel'} selected · {privatePayout ? 'private payout' : `$${dividendPaid.toLocaleString('en-US')} paid`}</strong><p>{privatePayout ? 'Dividend amounts stay private at this table.' : dividendPaid > 0 ? 'Eligible shareholders received their payout.' : 'No cash payout was due for this hotel.'}{report.insideTilesReturned ? ` ${report.insideTilesReturned} inside tile${report.insideTilesReturned === 1 ? '' : 's'} returned to the bag.` : ''}</p></>}
          </div>
        </div>}
        {rules.marketMode !== 'off' && <div className={`dice-outcome market ${report.marketShift < 0 ? 'low' : report.marketShift > 0 ? 'high' : 'normal'}`}>
          <span className="dice-outcome-icon">{report.marketShift < 0 ? <TrendingDown size={19} /> : <TrendingUp size={19} />}</span>
          <div>
            <span className="eyebrow">MARKET</span>
            <strong>{marketRolled ? 'A new market is set' : 'The market holds'}</strong>
            <p><MarketResult shift={report.marketShift} />{!marketRolled && ' until the next scheduled roll.'}</p>
          </div>
        </div>}
      </div>
      <div className="dice-reveal-footer">
        <span>{report.kind === 'round' ? `Round ${report.round} is complete.` : 'The next move is ready.'}</span>
        <button className="button primary" onClick={revealed ? onContinue : () => setRevealed(true)}>{revealed ? 'Continue to the table' : 'Show results'} <ArrowRight size={16} /></button>
      </div>
    </div>
  </Modal>;
}
