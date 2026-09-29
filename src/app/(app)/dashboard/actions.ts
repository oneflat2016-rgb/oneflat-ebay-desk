'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import {
  DEFAULT_JPY_PER_USD,
  getDashboardData,
  resolveDashboardPeriod,
  type DashboardData,
  type DashboardPeriodKey,
} from '@/repositories/dashboard';

/**
 * §49(Phase6実装仕様, 2026-09-29): ダッシュボードの期間切り替え用Server Action。
 * ページ初回表示は「今月」をServer Componentで直接取得し、期間セレクタ操作時は
 * この関数をクライアントから呼び出してデータを取り直す。
 *
 * Role別出し分け(ADMINのみ原価・粗利を見る)はここで行う。cost_price/粗利は
 * 「開発に関わるデータ」ではなく業務データだが、経営情報のため役割の低いユーザーには
 * 見せない、という既存方針(§8 hasRole)に合わせている。
 */
export interface DashboardResult {
  data: DashboardData;
  canSeeFinancials: boolean;
}

export async function getDashboard(
  periodKey: DashboardPeriodKey,
  custom?: { fromIso: string; toIso: string },
): Promise<DashboardResult | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const period = resolveDashboardPeriod(periodKey, custom);
  const data = await getDashboardData(period, DEFAULT_JPY_PER_USD);
  const canSeeFinancials = profile.role === 'ADMIN';

  if (!canSeeFinancials) {
    data.kpis = {
      ...data.kpis,
      periodSalesJpy: 0,
      periodGrossProfitJpy: null,
      costUnknownCount: 0,
    };
    data.trend = data.trend.map((t) => ({ ...t, salesJpy: 0 }));
  }

  return { data, canSeeFinancials };
}
