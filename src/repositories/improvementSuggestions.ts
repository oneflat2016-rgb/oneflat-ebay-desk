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
