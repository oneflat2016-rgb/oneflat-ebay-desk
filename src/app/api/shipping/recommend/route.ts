import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import { getShippingRateRules, findShippingHistoryStats } from '@/repositories/shipping';
import { computeShippingCandidates } from '@/lib/shipping/recommendationEngine';
import { generateShippingComparison } from '@/services/ai/suggestShipping';

/**
 * §21(最新実装指示書, Phase5): 配送提案(Shipping Recommendation Engine)のBackendエンドポイント。
 * §21-2の構成どおり、まずシステム側で実データ(料金表+自社発送実績)から候補を計算し、
 * Claudeにはその比較コメントの生成だけを行わせる。AI呼び出しが失敗・未設定でも
 * 候補自体は返せるようにし、出品作業を止めない(§21-26)。
 */

const requestSchema = z.object({
  weightG: z.number().positive(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  categoryName: z.string().nullable(),
  price: z.number().nullable(),
  destinationCountry: z.string().min(1),
});

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: 'ログインが必要です。' }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: '重量(g)と配送先を正しく入力してください。' },
      { status: 400 },
    );
  }

  try {
    const rateRules = await getShippingRateRules(profile.organizationId, parsed.data.destinationCountry);
    if (rateRules.length === 0) {
      return NextResponse.json(
        { message: 'この配送先向けの料金データが登録されていません。ADMINに登録を依頼してください。' },
        { status: 404 },
      );
    }

    const historyStats = await findShippingHistoryStats(parsed.data.categoryName);

    const candidates = computeShippingCandidates({
      weightG: parsed.data.weightG,
      rateRules,
      historyStats,
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { message: 'この重量に該当する配送方法が見つかりませんでした。料金表の対応重量範囲を確認してください。' },
        { status: 404 },
      );
    }

    let comparison: Awaited<ReturnType<typeof generateShippingComparison>> | null = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const result = await generateShippingComparison({
          brand: parsed.data.brand,
          model: parsed.data.model,
          categoryName: parsed.data.categoryName,
          price: parsed.data.price,
          weightG: parsed.data.weightG,
          destinationCountry: parsed.data.destinationCountry,
          candidates,
        });
        // §21-25: AIレスポンスは必ずサーバー側でvalidationしてから使う。
        // 与えた候補に無いserviceNameを返した場合は、システム側の最上位候補(先頭)へ
        // 無言でフォールバックする(§21-26: AI失敗で作業を止めない)。
        const validServiceNames = new Set(candidates.map((c) => c.serviceName));
        if (validServiceNames.has(result.recommendedServiceName)) {
          comparison = result;
        } else {
          comparison = {
            recommendedServiceName: candidates[0]!.serviceName,
            reasonJa: 'システムのスコアが最も高い候補です(AIコメントの取得に失敗したため表示していません)。',
            riskNotesJa: [],
            alternativeServiceName: null,
          };
        }
      } catch (aiErr) {
        console.error('[api/shipping/recommend] AI comparison failed', aiErr instanceof Error ? aiErr.message : aiErr);
        comparison = null;
      }
    }

    return NextResponse.json({
      candidates,
      comparison,
      historyStatsCount: historyStats.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/shipping/recommend] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '配送提案の取得に失敗しました。' }, { status: 502 });
  }
}
