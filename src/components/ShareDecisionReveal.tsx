import { ArrowRight, ArrowLeftRight, Banknote, Archive } from 'lucide-react';
import { CHAINS, getHouseRules } from '../game/engine';
import type { GameLog, GameState } from '../game/types';
import { money } from '../lib/storage';
import Modal from './Modal';
import CharacterAvatar from './CharacterAvatar';
import '../merger-reveal.css';
export function shareDecisionText(entry: GameLog, game: GameState, viewerId: string): string {
  const decision = entry.shareDecision!, name = game.players.find((player) => player.id === entry.playerId)?.name ?? 'Investor';
  if (getHouseRules(game).anonymousBuying && entry.playerId !== viewerId) return `${name} settled their merger shares privately.`;
  const chain = CHAINS.find((chain) => chain.id === decision.acquired)!.name, survivor = CHAINS.find((chain) => chain.id === decision.survivor)!.name;
  return `${name} sold ${decision.sell ?? 'private'} ${chain}, traded ${decision.trade ?? 'private'} for ${decision.received ?? 'private'} ${survivor}, and kept ${decision.keep ?? 'private'} ${chain}.`;
}
export default function ShareDecisionReveal({ entry, game, viewerId, onContinue }: { entry: GameLog; game: GameState; viewerId: string; onContinue: () => void }) {
  const decision = entry.shareDecision!, player = game.players.find((player) => player.id === entry.playerId)!;
  const acquired = CHAINS.find((chain) => chain.id === decision.acquired)!, survivor = CHAINS.find((chain) => chain.id === decision.survivor)!;
  const rules = getHouseRules(game), show = !rules.anonymousBuying || player.id === viewerId, showCash = show && (!rules.hiddenMoney || player.id === viewerId);
  return <Modal title={`${player.name} settles ${acquired.name}`} onClose={onContinue}>
    <div className="modal-body share-decision-reveal" data-testid="share-decision-reveal">
      <div className="share-decision-investor"><CharacterAvatar avatar={player.avatar} characterId={player.characterId} name={player.name} /><div><span className="eyebrow">MERGER DECISION · {show ? decision.role : 'PRIVATE'}</span><h3>{player.name} has chosen.</h3><p>{acquired.name} joins {survivor.name}</p></div></div>
      {show ? <div className="share-decision-options">
        <article><Banknote size={24} /><strong>{decision.sell ?? 'Private'}</strong><span>{acquired.name} sold</span><small>{showCash && decision.cash !== null ? `${money(decision.cash)} received` : 'Cash private'}</small></article>
        <article><ArrowLeftRight size={24} /><strong>{decision.trade ?? 'Private'}</strong><span>{acquired.name} traded</span><small>{decision.received ?? 'Private'} {survivor.name} received</small></article>
        <article><Archive size={24} /><strong>{decision.keep ?? 'Private'}</strong><span>{acquired.name} kept</span><small>For a possible comeback</small></article>
      </div> : <p className="muted">This table uses anonymous stock decisions. Their quantities stay private.</p>}
      <p className="muted small">Shareholders decide clockwise from the player who made the merger. Majority and minority determine bonuses. Earlier choices stay visible while you decide.</p>
      <button className="button primary full" onClick={onContinue}>Continue <ArrowRight size={17} /></button>
    </div>
  </Modal>;
}
