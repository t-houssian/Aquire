import type { OnlineProfile } from '../lib/online';
import { countryName } from '../lib/countries';
import '../social.css';
export default function ProfileStats({ record }: { record: OnlineProfile | null }) {
  const games = record?.games ?? 0,
    wins = record?.wins ?? 0,
    ties = record?.ties ?? 0;
  return (
    <section className="profile-record" aria-label="Online record">
      <div className="profile-record-heading">
        <strong>At the online tables</strong>
        <span>{record?.country ? countryName(record.country) : 'Country not shared'}</span>
      </div>
      <dl className="profile-stats">
        <div>
          <dt>Games played</dt>
          <dd>{games}</dd>
        </div>
        <div>
          <dt>Wins</dt>
          <dd>{wins}</dd>
        </div>
        <div>
          <dt>Win percentage</dt>
          <dd>{games ? `${((wins / games) * 100).toFixed(1)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Average place</dt>
          <dd>{games ? (record!.placementSum / games).toFixed(2) : '—'}</dd>
        </div>
        <div>
          <dt>Shared wins</dt>
          <dd>{ties}</dd>
        </div>
        <div>
          <dt>Losses</dt>
          <dd>{games - wins - ties}</dd>
        </div>
        <div>
          <dt>Best finish</dt>
          <dd>{record?.bestFinish ? `#${record.bestFinish}` : '—'}</dd>
        </div>
        <div>
          <dt>Best fortune</dt>
          <dd>{games ? `$${record!.bestScore.toLocaleString()}` : '—'}</dd>
        </div>
      </dl>
      <p className="muted small">
        Completed matches with at least two human players count. Shared first places are tracked
        separately from outright wins. Leaving an unfinished table adds no result.
      </p>
    </section>
  );
}
