import type { ShippingRateRule, ShippingHistoryStat } from '@/repositories/shipping';

/**
 * §21(最新実装指示書, Phase5): Shipping Recommendation Engine本体(§21-6)。
 * ここはAIを一切使わない純粋な計算ロジック。「実データをシステム側で取得・計算し、
 * その結果をAIが整理して説明する」という§21-2の構成に沿って、候補の生成・スコアリング・
 * ラベル付けまでをここで完結させる(Claudeは比較コメントの文章化のみ担当、§21-24)。
 */

export interface ShippingCandidate {
  carrier: string;
  serviceName: string;
  estimatedCostJpy: number;
  deliveryMinDays: number;
  deliveryMaxDays: number;
  trackingAvailable: boolean;
  insuranceAvailable: boolean;
  /** §21-10: 送料の根拠データ種別。Claudeによる推測はここに含めない。 */
  sourceType: 'rate_table' | 'rate_table_with_history';
  pastUsageCount: number;
  averagePastCostJpy: number | null;
  score: number;
  labels: string[];
}

/**
 * §21-22のスコアリング(固定値にせず調整しやすいよう定数化)。
 * 送料30% → 配送速度20%相当だが、事故実績データ(shipping_actualsに未収録)を除いた分を
 * 送料・過去実績へ再配分している(§21-22は「後で変更可能な設計とする」とあるため、
 * この関数の重みだけを変えれば挙動を調整できる)。
 */
const SCORE_WEIGHTS = {
  cost: 0.35,
  speed: 0.25,
  tracking: 0.15,
  pastUsage: 0.25,
};

export function computeShippingCandidates(params: {
  weightG: number;
  rateRules: ShippingRateRule[];
  historyStats: ShippingHistoryStat[];
}): ShippingCandidate[] {
  const matching = params.rateRules.filter(
    (rule) => params.weightG >= rule.minWeightG && params.weightG <= rule.maxWeightG,
  );
  if (matching.length === 0) return [];

  const historyByKey = new Map(
    params.historyStats.map((h) => [`${h.carrier}__${h.serviceName}`, h] as const),
  );

  const raw = matching.map((rule) => {
    const weightKg = params.weightG / 1000;
    const estimatedCostJpy = Math.round(rule.baseCostJpy + rule.costPerKgJpy * weightKg);
    const history = historyByKey.get(`${rule.carrier}__${rule.serviceName}`);
    return {
      rule,
      estimatedCostJpy,
      pastUsageCount: history?.usageCount ?? 0,
      averagePastCostJpy: history?.averageActualCostJpy ?? null,
    };
  });

  const costs = raw.map((r) => r.estimatedCostJpy);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const avgDaysList = raw.map((r) => (r.rule.deliveryMinDays + r.rule.deliveryMaxDays) / 2);
  const minDays = Math.min(...avgDaysList);
  const maxDays = Math.max(...avgDaysList);
  const maxUsage = Math.max(...raw.map((r) => r.pastUsageCount), 1);

  const scored = raw.map((r, i) => {
    const costScore = maxCost === minCost ? 1 : (maxCost - r.estimatedCostJpy) / (maxCost - minCost);
    const avgDays = avgDaysList[i]!;
    const speedScore = maxDays === minDays ? 1 : (maxDays - avgDays) / (maxDays - minDays);
    const trackingScore = r.rule.trackingAvailable ? 1 : 0;
    const pastUsageScore = r.pastUsageCount > 0 ? Math.min(r.pastUsageCount / maxUsage, 1) : 0;
    const score =
      costScore * SCORE_WEIGHTS.cost +
      speedScore * SCORE_WEIGHTS.speed +
      trackingScore * SCORE_WEIGHTS.tracking +
      pastUsageScore * SCORE_WEIGHTS.pastUsage;
    return { ...r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const cheapestCost = Math.min(...scored.map((r) => r.estimatedCostJpy));
  const fastestAvgDays = Math.min(...scored.map((r) => (r.rule.deliveryMinDays + r.rule.deliveryMaxDays) / 2));

  return scored.slice(0, 3).map((r, index): ShippingCandidate => {
    const labels: string[] = [];
    if (index === 0) labels.push('推奨');
    if (r.estimatedCostJpy === cheapestCost) labels.push('最安');
    if ((r.rule.deliveryMinDays + r.rule.deliveryMaxDays) / 2 === fastestAvgDays) labels.push('最速');
    if (r.pastUsageCount > 0) labels.push('過去実績あり');
    if (r.rule.insuranceAvailable) labels.push('保険あり');

    return {
      carrier: r.rule.carrier,
      serviceName: r.rule.serviceName,
      estimatedCostJpy: r.estimatedCostJpy,
      deliveryMinDays: r.rule.deliveryMinDays,
      deliveryMaxDays: r.rule.deliveryMaxDays,
      trackingAvailable: r.rule.trackingAvailable,
      insuranceAvailable: r.rule.insuranceAvailable,
      sourceType: r.pastUsageCount > 0 ? 'rate_table_with_history' : 'rate_table',
      pastUsageCount: r.pastUsageCount,
      averagePastCostJpy: r.averagePastCostJpy,
      score: Math.round(r.score * 1000) / 1000,
      labels,
    };
  });
}
