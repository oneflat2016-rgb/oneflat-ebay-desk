import Link from 'next/link';
import { getSellThroughByCategory, getSellThroughOverview } from '@/repositories/analytics';
import { listPublishedListings } from '@/repositories/listings';
import { getLatestTrafficSnapshotMap } from '@/repositories/traffic';
import { TrafficSyncButton } from '@/components/analytics/TrafficSyncButton';

/**
 * §32(Phase6実装仕様, 2026-09-29): 販売速度分析の画面(第一段階)。
 *
 * 集計ロジック自体は src/repositories/analytics.ts に既に実装済み
 * (改善提案画面の判定に内部利用されていた)。本画面はそのデータを
 * そのまま社員向けに可視化するもので、新しい集計は追加しない。
 *
 * 2026-10-08: ダッシュボードの文字量削減と同じ方針で、KPIは数値を主役にし、
 * 説明文は最小限に留めた。
 */
export default async function AnalyticsPage() {
  const [overview, byCategory, listings] = await Promise.all([
    getSellThroughOverview(),
    getSellThroughByCategory(),
    listPublishedListings(),
  ]);

  const activeListings = listings.filter((l) => l.status === 'ACTIVE');
  const trafficMap = await getLatestTrafficSnapshotMap(activeListings.map((l) => l.id));

  const within7Rate = overview.soldCount > 0 ? Math.round((overview.soldWithin7Days / overview.soldCount) * 100) : null;
  const within30Rate = overview.soldCount > 0 ? Math.round((overview.soldWithin30Days / overview.soldCount) * 100) : null;
  const within60Rate = overview.soldCount > 0 ? Math.round((overview.soldWithin60Days / overview.soldCount) * 100) : null;

  return (
    <main>
      <header className="page-header">
        <span className="page-header-eyebrow">ONEFLAT EBAY LISTING DESK</span>
        <h1>販売速度分析</h1>
        <p className="subnote">出品から売れるまでの日数をもとに、全体とカテゴリー別の傾向をまとめています。</p>
      </header>

      <div className="dashboard-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard label="販売済み件数" value={`${overview.soldCount}件`} />
        <KpiCard
          label="平均販売日数"
          value={overview.averageDaysToSell !== null ? `${overview.averageDaysToSell.toFixed(1)}日` : '-'}
        />
        <KpiCard
          label="中央値販売日数"
          value={overview.medianDaysToSell !== null ? `${overview.medianDaysToSell.toFixed(1)}日` : '-'}
        />
        <KpiCard
          label="7日以内に販売"
          value={`${overview.soldWithin7Days}件`}
          note={within7Rate !== null ? `全体の${within7Rate}%` : undefined}
        />
        <KpiCard
          label="30日以内に販売"
          value={`${overview.soldWithin30Days}件`}
          note={within30Rate !== null ? `全体の${within30Rate}%` : undefined}
        />
        <KpiCard
          label="60日以内に販売"
          value={`${overview.soldWithin60Days}件`}
          note={within60Rate !== null ? `全体の${within60Rate}%` : undefined}
        />
      </div>

      <section className="card dashboard-section">
        <h2>出品中のまま経過している件数</h2>
        <div className="dashboard-kpi-grid">
          <KpiCard label="30日以上" value={`${overview.activeOver30Days}件`} highlight={overview.activeOver30Days > 0} />
          <KpiCard label="60日以上" value={`${overview.activeOver60Days}件`} highlight={overview.activeOver60Days > 0} />
          <KpiCard label="90日以上" value={`${overview.activeOver90Days}件`} highlight={overview.activeOver90Days > 0} />
        </div>
        <p className="subnote" style={{ marginTop: 10, marginBottom: 0 }}>
          該当する商品は<Link href="/improvements">改善提案</Link>でも確認できます。
        </p>
      </section>

      <section className="card dashboard-section">
        <h2>View/Watch(出品中の商品)</h2>
        <p className="subnote" style={{ marginTop: -4 }}>
          eBay Trading APIから取得した最新のView数・Watch数です。「View/Watchを同期」を押すと最新の値を取得します。
        </p>
        <TrafficSyncButton />
        {activeListings.length === 0 ? (
          <p className="subnote">現在、出品中(ACTIVE)の商品がありません。</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                  <th style={{ padding: '6px 10px' }}>タイトル</th>
                  <th style={{ padding: '6px 10px' }}>View数</th>
                  <th style={{ padding: '6px 10px' }}>Watch数</th>
                  <th style={{ padding: '6px 10px' }}>取得日時</th>
                </tr>
              </thead>
              <tbody>
                {activeListings.map((l) => {
                  const snap = trafficMap.get(l.id);
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 10px', maxWidth: 320 }}>{l.title ?? '(タイトル未取得)'}</td>
                      <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                        {snap?.viewItemCount ?? '-'}
                      </td>
                      <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                        {snap?.watchCount ?? '-'}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: '.78rem', color: 'var(--muted)' }}>
                        {snap ? formatDateTime(snap.capturedAt) : '未取得'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card dashboard-section">
        <h2>カテゴリー別の販売速度</h2>
        {byCategory.length === 0 ? (
          <p className="subnote">集計できる販売実績がまだありません。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                  <th style={{ padding: '6px 10px' }}>カテゴリー</th>
                  <th style={{ padding: '6px 10px' }}>販売件数</th>
                  <th style={{ padding: '6px 10px' }}>平均販売日数</th>
                  <th style={{ padding: '6px 10px' }}>中央値</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.categoryId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 10px' }}>{c.categoryName ?? c.categoryId}</td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>{c.soldCount}件</td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {c.averageDaysToSell !== null ? `${c.averageDaysToSell.toFixed(1)}日` : '-'}
                    </td>
                    <td style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
                      {c.medianDaysToSell !== null ? `${c.medianDaysToSell.toFixed(1)}日` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="subnote" style={{ marginTop: 10, marginBottom: 0 }}>
          件数が少ないカテゴリーは参考値として見てください。
        </p>
      </section>
    </main>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function KpiCard({
  label,
  value,
  note,
  highlight,
}: {
  label: string;
  value: string;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className="card dashboard-kpi-card" data-highlight={highlight ? 'true' : undefined}>
      <div className="dashboard-kpi-label">{label}</div>
      <div className="dashboard-kpi-value">{value}</div>
      {note && <div className="dashboard-kpi-note">{note}</div>}
    </div>
  );
}
