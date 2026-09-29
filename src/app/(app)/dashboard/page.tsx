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
