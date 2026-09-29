#!/bin/bash
set -euo pipefail
cd "$HOME/oneflat-ebay-desk"

mkdir -p "src/repositories" "src/app/(app)/improvements" "src/app/(app)/dashboard"

cat > "src/repositories/improvementSuggestions.ts" << 'ONEFLAT_EOF_1192'
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSellThroughByCategory, getSellThroughOverview } from '@/repositories/analytics';

/**
 * §35(Phase6実装仕様, 2026-09-29): 売れない商品の改善提案(第一段階)。
 *
 * 仕様書の方針どおり、AIによるスコアリングではなく、まずはルールベースで
 * 「なぜ売れていない可能性があるか」を機械的に判定する。判定材料は現時点で
 * 実際にアプリへ蓄積されているデータ(出品からの経過日数、カテゴリー別の
 * 平均/中央値販売日数)に限定している。
 *
 * 仕様書は本来、View/Watch(§34)・値下げ履歴(§33)も判断材料に使うことを
 * 想定しているが、これらはまだ本番環境に反映されていない(traffic_snapshots・
 * listing_price_historyが未適用)。そのため今回はこの2系統のルールは実装せず、
 * それらのデータが揃った時点でルールを追加できるよう、判定ロジックを
 * 1ルール=1関数の形にして拡張しやすくしてある(下記「拡張ポイント」を参照)。
 *
 * 拡張ポイント(Phase6の他データが適用された後に追加する想定):
 *   - View多い/Watch多いのに販売なし → 価格・送料が障壁の可能性
 *   - Impression少ない → カテゴリー・タイトル・Item Specificsの見直し
 *   - 直近30日値下げなし → 値下げ提案
 */

export type SuggestionSeverity = 'critical' | 'warning' | 'notice';

export interface ImprovementSuggestion {
  listingId: string;
  sku: string;
  title: string | null;
  price: number | null;
  currency: string | null;
  categoryId: string | null;
  categoryName: string | null;
  daysSincePublished: number;
  severity: SuggestionSeverity;
  reasons: string[];
}

const SEVERITY_RANK: Record<SuggestionSeverity, number> = { critical: 0, warning: 1, notice: 2 };

interface ActiveListingRow {
  id: string;
  sku: string;
  category_id: string | null;
  published_at: string | null;
  listing_draft: { title: string | null; price: number | string | null; currency: string | null } | null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, Math.round((to - from) / (1000 * 60 * 60 * 24)));
}

function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/**
 * 出品からの経過日数だけでも判定できる、基本的な「長期未販売」ルール。
 * カテゴリー実績の有無に関わらず常に評価する。
 */
function evaluateLongUnsoldRule(daysSincePublished: number): { severity: SuggestionSeverity; reason: string } | null {
  if (daysSincePublished >= 90) {
    return { severity: 'critical', reason: `出品から${daysSincePublished}日が経過し、90日以上未販売です。価格・タイトル・写真の見直し、または出品終了を検討してください。` };
  }
  if (daysSincePublished >= 60) {
    return { severity: 'warning', reason: `出品から${daysSincePublished}日が経過し、60日以上未販売です。価格の見直しを検討してください。` };
  }
  if (daysSincePublished >= 30) {
    return { severity: 'notice', reason: `出品から${daysSincePublished}日が経過し、30日以上未販売です。` };
  }
  return null;
}

/**
 * 同カテゴリーの平均販売日数と比較するルール。カテゴリーの販売実績が
 * 3件未満の場合は統計として信頼できないため評価しない。
 */
function evaluateCategoryPaceRule(
  daysSincePublished: number,
  category: { soldCount: number; averageDaysToSell: number | null } | undefined,
): { severity: SuggestionSeverity; reason: string } | null {
  if (!category || category.soldCount < 3 || category.averageDaysToSell === null) return null;
  const ratio = daysSincePublished / category.averageDaysToSell;
  if (ratio >= 2) {
    return {
      severity: 'warning',
      reason: `同カテゴリーの平均販売日数(${category.averageDaysToSell.toFixed(0)}日)の2倍以上、出品期間が経過しています。`,
    };
  }
  if (ratio >= 1.5) {
    return {
      severity: 'notice',
      reason: `同カテゴリーの平均販売日数(${category.averageDaysToSell.toFixed(0)}日)を大きく超えています。`,
    };
  }
  return null;
}

/**
 * §35の第一段階: 出品中(ACTIVE)の商品について、経過日数とカテゴリー実績から
 * ルールベースで改善提案を作成する。全社実績が薄いカテゴリーでは全体平均を
 * フォールバックとして使う。
 */
export async function getImprovementSuggestions(limit = 30): Promise<ImprovementSuggestion[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, sku, category_id, published_at, listing_draft:listing_drafts(title, price, currency)',
    )
    .eq('status', 'ACTIVE')
    .not('published_at', 'is', null);
  if (error) throw error;

  const [categoryStats, overview] = await Promise.all([getSellThroughByCategory(), getSellThroughOverview()]);
  const categoryById = new Map(categoryStats.map((c) => [c.categoryId, c]));

  const now = new Date().toISOString();
  const suggestions: ImprovementSuggestion[] = [];

  for (const raw of (data ?? []) as unknown as ActiveListingRow[]) {
    const draft = firstOf(raw.listing_draft as ActiveListingRow['listing_draft'] | ActiveListingRow['listing_draft'][]);
    const publishedAt = raw.published_at;
    if (!publishedAt) continue;
    const daysSincePublished = daysBetween(publishedAt, now);

    const reasons: string[] = [];
    let severity: SuggestionSeverity | null = null;

    const longUnsold = evaluateLongUnsoldRule(daysSincePublished);
    if (longUnsold) {
      reasons.push(longUnsold.reason);
      severity = longUnsold.severity;
    }

    const category = raw.category_id ? categoryById.get(raw.category_id) : undefined;
    const categoryPace = evaluateCategoryPaceRule(daysSincePublished, category);
    if (categoryPace) {
      reasons.push(categoryPace.reason);
      if (!severity || SEVERITY_RANK[categoryPace.severity] < SEVERITY_RANK[severity]) {
        severity = categoryPace.severity;
      }
    } else if (!category && overview.medianDaysToSell !== null && daysSincePublished >= overview.medianDaysToSell * 2 && overview.soldCount >= 3) {
      // カテゴリー実績が薄い場合のフォールバック: 全社の中央値と比較する。
      reasons.push(`全社の中央値販売日数(${overview.medianDaysToSell}日)の2倍以上、出品期間が経過しています(カテゴリー別の実績はまだ十分ではありません)。`);
      if (!severity) severity = 'notice';
    }

    if (!severity || reasons.length === 0) continue;

    suggestions.push({
      listingId: raw.id,
      sku: raw.sku,
      title: draft?.title ?? null,
      price: draft?.price === null || draft?.price === undefined ? null : Number(draft.price),
      currency: draft?.currency ?? null,
      categoryId: raw.category_id,
      categoryName: category?.categoryName ?? null,
      daysSincePublished,
      severity,
      reasons,
    });
  }

  return suggestions
    .sort((a, b) => {
      const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rankDiff !== 0) return rankDiff;
      return b.daysSincePublished - a.daysSincePublished;
    })
    .slice(0, limit);
}
ONEFLAT_EOF_1192
echo "[OK] wrote src/repositories/improvementSuggestions.ts"

cat > "src/app/(app)/improvements/page.tsx" << 'ONEFLAT_EOF_74017'
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
ONEFLAT_EOF_74017
echo "[OK] wrote src/app/(app)/improvements/page.tsx"


cat > "src/app/(app)/dashboard/page.tsx" << 'ONEFLAT_EOF_DASHPAGE'
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { DEFAULT_JPY_PER_USD, getDashboardData, resolveDashboardPeriod } from '@/repositories/dashboard';
import { DashboardClient } from './DashboardClient';

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードの本実装(第一段階)。
 * 優先度Aの主要KPI(今月の売上・粗利・販売件数・出品中件数・平均販売日数・
 * 30日以上未販売件数)、期間切り替え(デフォルト=今月)、販売推移グラフ、
 * 「要対応」セクション、Role別出し分け(ADMINのみ原価・粗利を表示)を実装する。
 *
 * §30(ホーム画面の導線: 撮影して出品/型番登録/バーコード登録/複製)は別セクションのため、
 * このKPIセクションの下に簡易な導線を残す形にする。
 */
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  const period = resolveDashboardPeriod('thisMonth');
  const data = await getDashboardData(period, DEFAULT_JPY_PER_USD);
  const canSeeFinancials = profile?.role === 'ADMIN';

  if (!canSeeFinancials) {
    data.kpis = { ...data.kpis, periodSalesJpy: 0, periodGrossProfitJpy: null, costUnknownCount: 0 };
    data.trend = data.trend.map((t) => ({ ...t, salesJpy: 0 }));
  }

  return (
    <main>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          ONEFLAT EBAY LISTING DESK
        </div>
        <h1 style={{ fontSize: 'clamp(1.5rem,3vw,2.1rem)' }}>ダッシュボード</h1>
      </header>

      <DashboardClient initial={{ data, canSeeFinancials }} initialPeriod="thisMonth" />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 32, paddingTop: 18, borderTop: '2px solid var(--line-strong)' }}>
        <Link href="/listings/new" className="btn primary">
          📷 商品を撮影して出品(暫定: 従来フォームへ)
        </Link>
        <Link href="/listings" className="btn">
          出品済みListing一覧を見る
        </Link>
        <Link href="/sales" className="btn">
          販売履歴を見る
        </Link>
        <Link href="/improvements" className="btn">
          改善提案を見る
        </Link>
      </div>
    </main>
  );
}
ONEFLAT_EOF_DASHPAGE
echo "[OK] updated src/app/(app)/dashboard/page.tsx (added improvements link)"

echo "Done. Now run: npx tsc --noEmit -p . && npm run build"
