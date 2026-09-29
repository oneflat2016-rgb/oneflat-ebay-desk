import Link from 'next/link';
import { getImprovementSuggestions, type SuggestionSeverity } from '@/repositories/improvementSuggestions';

/**
 * §35(Phase6実装仕様, 2026-09-29): 売れない商品の改善提案(第一段階)。
 * 出品からの経過日数・カテゴリー平均販売日数から、ルールベースで
 * 「改善を検討すべき商品」を一覧化する。View/Watch/値下げ履歴を使った
 * より精度の高い判定は、それらのPhase6データが本番反映された後に追加する
 * (src/repositories/improvementSuggestions.tsの「拡張ポイント」参照)。
 */
export default async function ImprovementsPage() {
  const suggestions = await getImprovementSuggestions();

  return (
    <main>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          ONEFLAT EBAY LISTING DESK
        </div>
        <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>改善提案</h1>
        <p className="subnote" style={{ maxWidth: '62ch' }}>
          出品からの経過日数と、同カテゴリーの平均販売日数をもとに、改善を検討すべき商品をルールベースで抽出しています。
          現時点ではView/Watch・値下げ履歴のデータはまだ反映されていないため、それらを使った判定は今後追加予定です。
        </p>
      </header>

      {suggestions.length === 0 ? (
        <p className="subnote">現在、改善を検討すべき商品はありません。</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line-strong)' }}>
                <th style={{ padding: '8px 10px' }}>状態</th>
                <th style={{ padding: '8px 10px' }}>タイトル</th>
                <th style={{ padding: '8px 10px' }}>SKU</th>
                <th style={{ padding: '8px 10px' }}>経過日数</th>
                <th style={{ padding: '8px 10px' }}>価格</th>
                <th style={{ padding: '8px 10px' }}>理由</th>
                <th style={{ padding: '8px 10px' }} />
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.listingId} style={{ borderBottom: '1px solid var(--line)', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <SeverityBadge severity={s.severity} />
                  </td>
                  <td style={{ padding: '8px 10px', maxWidth: 280 }}>{s.title ?? '(タイトル未取得)'}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{s.sku}</td>
                  <td style={{ padding: '8px 10px' }}>{s.daysSincePublished}日</td>
                  <td style={{ padding: '8px 10px' }}>{s.price !== null ? `${s.currency ?? ''} ${s.price}` : '-'}</td>
                  <td style={{ padding: '8px 10px', maxWidth: 420 }}>
                    <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
                      {s.reasons.map((r, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <Link href="/listings" className="btn" style={{ fontSize: '.75rem', padding: '2px 8px' }}>
                      一覧で見る
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const SEVERITY_LABELS: Record<SuggestionSeverity, string> = {
  critical: '重大',
  warning: '要注意',
  notice: '注意',
};

const SEVERITY_COLORS: Record<SuggestionSeverity, string> = {
  critical: '#b3261e',
  warning: '#b06a00',
  notice: 'var(--muted)',
};

function SeverityBadge({ severity }: { severity: SuggestionSeverity }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '.76rem',
        border: `1px solid ${SEVERITY_COLORS[severity]}`,
        color: SEVERITY_COLORS[severity],
        whiteSpace: 'nowrap',
      }}
    >
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
