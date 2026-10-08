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
 *
 * 2026-10-08: 「出品するボタンが下の方にあってわかりにくい」
 * 「文字が多くてわかりにくい」という要望に対応し、出品導線を画面最上部の
 * 目立つCTAとして配置、それ以外の導線は控えめなテキストリンクに変更。
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
      <header className="page-header">
        <span className="page-header-eyebrow">ONEFLAT EBAY LISTING DESK</span>
        <h1>ダッシュボード</h1>
      </header>

      <Link href="/listings/new" className="dashboard-cta">
        <span className="dashboard-cta-icon" aria-hidden="true">📷</span>
        <span className="dashboard-cta-text">
          <span className="dashboard-cta-title">商品を撮影して出品する</span>
          <span className="dashboard-cta-sub">新しい商品の出品を始める</span>
        </span>
        <span className="dashboard-cta-arrow" aria-hidden="true">→</span>
      </Link>

      <DashboardClient initial={{ data, canSeeFinancials }} initialPeriod="thisMonth" />

      <nav className="dashboard-links" aria-label="その他のページ">
        <Link href="/listings">出品済みListing一覧</Link>
        <Link href="/sales">販売履歴</Link>
        <Link href="/improvements">改善提案</Link>
      </nav>
    </main>
  );
}
