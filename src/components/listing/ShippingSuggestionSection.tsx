'use client';

import { useEffect, useState } from 'react';

/**
 * §21-22(最新実装指示書, Phase5): 配送提案(Shipping Recommendation Engine)のUI。
 *
 * §21-2の設計思想どおり、「AIが送料を推測する」のではなく「システム側で実データ
 * (登録料金表+自社の過去発送実績)から候補を計算し、Claudeはその比較コメントだけを担当する」
 * という構成をそのまま反映する。候補をクリックしてもこの時点ではeBayへは何も送信されない
 * (§21-20: 担当者が選ぶまでは"selected_shipping_method"としてDBに保持するだけ)。
 * eBay Business Policyへの反映も、あくまで「おすすめポリシー」の提示にとどめ、
 * 「このポリシーを使用」ボタンを押した場合のみBusiness Policiesセクションの選択値を変更する
 * (§21-11/§21-13: AIやシステムが担当者の確認なしにBusiness Policyを変更しない)。
 */

interface ShippingCandidate {
  carrier: string;
  serviceName: string;
  /** null = ポリシーには登録されているが、アプリの料金表に該当がなく目安を出せない */
  estimatedCostJpy: number | null;
  deliveryMinDays: number | null;
  deliveryMaxDays: number | null;
  trackingAvailable: boolean | null;
  insuranceAvailable: boolean | null;
  sourceType: 'rate_table' | 'rate_table_with_history' | 'policy_only';
  pastUsageCount: number;
  averagePastCostJpy: number | null;
  score: number;
  labels: string[];
}

interface ShippingComparison {
  recommendedServiceName: string;
  reasonJa: string;
  riskNotesJa: string[];
  alternativeServiceName: string | null;
}

interface FulfillmentPolicyOption {
  policyId: string;
  name: string;
  shippingServices: { optionType: string; carrierCode: string | null; serviceCode: string; freeShipping: boolean }[];
}

/** 英数字だけにそろえて、表記ゆれ(スペース・記号・大文字小文字)を無視して比べる */
function norm(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 配送候補が、ポリシーに登録された発送方法のどれかに当たるか */
function matchesPolicyService(
  c: { carrier: string; serviceName: string },
  services: FulfillmentPolicyOption['shippingServices'],
): boolean {
  const name = norm(c.serviceName);
  const carrier = norm(c.carrier);
  return services.some((s) => {
    const code = norm(s.serviceCode);
    const sc = s.carrierCode ? norm(s.carrierCode) : '';
    return (
      (code && (code.includes(name) || name.includes(code))) ||
      (carrier && (code.includes(carrier) || (sc && (sc.includes(carrier) || carrier.includes(sc)))))
    );
  });
}

const DESTINATION_OPTIONS: { value: string; labelJa: string }[] = [
  { value: 'US', labelJa: 'アメリカ' },
  { value: 'GB', labelJa: 'イギリス' },
  { value: 'DE', labelJa: 'ドイツ' },
  { value: 'AU', labelJa: 'オーストラリア' },
  { value: 'CA', labelJa: 'カナダ' },
];

export function ShippingSuggestionSection({
  weightG,
  widthMm,
  heightMm,
  depthMm,
  destinationCountry,
  brand,
  model,
  categoryName,
  price,
  selectedShippingMethod,
  fulfillmentPolicyId,
  onWeightSizeChange,
  onDestinationChange,
  onSelectShippingMethod,
  onSelectFulfillmentPolicy,
}: {
  weightG: string;
  widthMm: string;
  heightMm: string;
  depthMm: string;
  destinationCountry: string;
  brand: string | null;
  model: string | null;
  categoryName: string | null;
  price: string;
  selectedShippingMethod: string | null;
  fulfillmentPolicyId: string | null;
  onWeightSizeChange: (patch: { weightG?: string; widthMm?: string; heightMm?: string; depthMm?: string }) => void;
  onDestinationChange: (destinationCountry: string) => void;
  onSelectShippingMethod: (serviceName: string) => void;
  onSelectFulfillmentPolicy: (policyId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ShippingCandidate[] | null>(null);
  const [comparison, setComparison] = useState<ShippingComparison | null>(null);
  const [historyStatsCount, setHistoryStatsCount] = useState(0);

  const [fulfillmentPolicies, setFulfillmentPolicies] = useState<FulfillmentPolicyOption[]>([]);

  // §21-12: fulfillment_policy候補を取得しておく(既存の/api/ebay/policiesを再利用)。
  // 取得できなくても配送提案自体は使えるよう、失敗しても無視するだけにする。
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ebay/policies')
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ fulfillmentPolicies?: { policyId: string; name: string; shippingServices?: FulfillmentPolicyOption['shippingServices'] }[] }>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setFulfillmentPolicies(
          (data.fulfillmentPolicies ?? []).map((p) => ({
            policyId: p.policyId,
            name: p.name,
            shippingServices: p.shippingServices ?? [],
          })),
        );
      })
      .catch(() => {
        /* §21-26と同じ方針: 取得できなくても配送提案自体は止めない */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const weightNum = Number(weightG);
  const canRequest = Boolean(weightG.trim()) && Number.isFinite(weightNum) && weightNum > 0;

  async function handleSuggest() {
    setLoading(true);
    setErrorText(null);
    setCandidates(null);
    setComparison(null);
    try {
      const res = await fetch('/api/shipping/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightG: weightNum,
          brand,
          model,
          categoryName,
          price: price.trim() ? Number(price) : null,
          destinationCountry,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? '配送提案を取得できませんでした。');
      }
      const data = (await res.json()) as {
        candidates: ShippingCandidate[];
        comparison: ShippingComparison | null;
        historyStatsCount: number;
      };
      setCandidates(data.candidates);
      setComparison(data.comparison);
      setHistoryStatsCount(data.historyStatsCount);
    } catch (err) {
      // §21-26: 配送APIやClaude APIが使えなくても出品作業自体は続けられるようにする。
      setErrorText(
        err instanceof Error
          ? err.message
          : '現在、配送提案を取得できません。Business Policyを手動で選択してください。',
      );
    } finally {
      setLoading(false);
    }
  }

  // 選択中の配送ポリシーに登録されている発送方法。あれば候補をこれだけに絞る。
  const selectedPolicy = fulfillmentPolicies.find((p) => p.policyId === fulfillmentPolicyId) ?? null;
  const policyServices = selectedPolicy?.shippingServices ?? [];
  // 配送ポリシーが選ばれている場合は、ポリシーに登録されている発送方法そのものを候補にする。
  // アプリの料金表に該当があれば送料目安などを付け、無ければ「目安なし」で表示する。
  const policyBased: ShippingCandidate[] | null =
    candidates && policyServices.length > 0
      ? policyServices
          .filter((svc, i, arr) => arr.findIndex((o) => o.serviceCode === svc.serviceCode) === i)
          .map((svc) => {
            const hit = candidates.find((c) => matchesPolicyService(c, [svc]));
            if (hit) return { ...hit, serviceName: hit.serviceName, labels: [...hit.labels] };
            return {
              carrier: svc.carrierCode ?? '',
              serviceName: svc.serviceCode,
              estimatedCostJpy: null,
              deliveryMinDays: null,
              deliveryMaxDays: null,
              trackingAvailable: null,
              insuranceAvailable: null,
              sourceType: 'policy_only' as const,
              pastUsageCount: 0,
              averagePastCostJpy: null,
              score: 0,
              labels: svc.freeShipping ? ['送料無料設定'] : [],
            };
          })
      : null;
  const visibleCandidates: ShippingCandidate[] | null = policyBased ?? candidates;

  const recommendedCandidate = comparison
    ? candidates?.find((c) => c.serviceName === comparison.recommendedServiceName) ?? null
    : null;
  const suggestedPolicy = recommendedCandidate
    ? fulfillmentPolicies.find((p) => p.name.toLowerCase().includes(recommendedCandidate.carrier.toLowerCase()))
    : undefined;

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>12. 配送提案(§21-22)</h2>
        <span className="hint">重量・サイズ・配送先から配送方法の候補を計算し、Claudeが比較コメントを付けます(任意・自動反映しません)</span>
      </div>
      <p className="subnote">
        送料はAIの推測ではなく、登録済みの料金表と自社の過去発送実績(あれば)から計算します。Claudeは候補の比較・説明のみを行います。最終的な配送方法・Business Policyの決定は必ず担当者が行ってください。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">重量(g)</span>
          <input
            type="number"
            inputMode="decimal"
            value={weightG}
            onChange={(e) => onWeightSizeChange({ weightG: e.target.value })}
            placeholder="例: 2800"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">縦(mm)</span>
          <input
            type="number"
            inputMode="decimal"
            value={widthMm}
            onChange={(e) => onWeightSizeChange({ widthMm: e.target.value })}
            placeholder="例: 480"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">横(mm)</span>
          <input
            type="number"
            inputMode="decimal"
            value={heightMm}
            onChange={(e) => onWeightSizeChange({ heightMm: e.target.value })}
            placeholder="例: 250"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">高さ(mm)</span>
          <input
            type="number"
            inputMode="decimal"
            value={depthMm}
            onChange={(e) => onWeightSizeChange({ depthMm: e.target.value })}
            placeholder="例: 180"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="subnote">配送先想定</span>
          <select value={destinationCountry} onChange={(e) => onDestinationChange(e.target.value)}>
            {DESTINATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.labelJa}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={handleSuggest} disabled={loading || !canRequest}>
          {loading ? '配送方法を計算中…' : '配送方法を提案'}
        </button>
        {!canRequest && (
          <p className="subnote" style={{ marginTop: 8 }}>
            重量(g)を入力すると配送方法を提案できます。
          </p>
        )}
      </div>

      {errorText && (
        <p className="subnote" style={{ marginTop: 8, color: 'var(--danger)' }}>
          {errorText}
        </p>
      )}

      <div className="subnote" style={{ marginTop: 12 }}>
        {selectedPolicy ? (
          <>
            選択中の配送ポリシー「{selectedPolicy.name}」に登録されている発送方法:{' '}
            {policyServices.length > 0
              ? policyServices.map((s) => s.serviceCode).join(' / ')
              : '(取得できませんでした)'}
          </>
        ) : (
          '上の「Business Policies」で配送ポリシーを選ぶと、そのポリシーに登録されている発送方法だけが候補に出ます。'
        )}
      </div>

      {visibleCandidates && visibleCandidates.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleCandidates.map((c) => {
            const isSelected = selectedShippingMethod === c.serviceName;
            return (
              <div
                key={c.serviceName}
                style={{
                  border: isSelected ? '2px solid var(--accent, #2563eb)' : '1px solid var(--border-color, #ddd)',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                  <strong>{c.serviceName}</strong>
                  <span className="subnote">
                    {c.labels.map((l) => (
                      <span
                        key={l}
                        style={{
                          display: 'inline-block',
                          marginLeft: 6,
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                          background: 'var(--chip-bg, #eef2ff)',
                        }}
                      >
                        {l}
                      </span>
                    ))}
                  </span>
                </div>
                {c.estimatedCostJpy === null ? (
                  <p className="subnote" style={{ margin: 0 }}>
                    配送ポリシーに登録済みの発送方法です(アプリの料金表に該当が無いため、送料目安は出せません)。
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0 }}>
                      送料目安: ¥{c.estimatedCostJpy.toLocaleString('ja-JP')}
                      <span className="subnote" style={{ marginLeft: 8 }}>
                        (データ: {c.sourceType === 'rate_table_with_history' ? '登録料金表+自社発送実績' : '登録料金表(参考値)'})
                      </span>
                    </p>
                    <p className="subnote" style={{ margin: 0 }}>
                      配送目安: {c.deliveryMinDays}〜{c.deliveryMaxDays}営業日 / 追跡: {c.trackingAvailable ? 'あり' : 'なし'} / 保険:{' '}
                      {c.insuranceAvailable ? 'あり' : 'なし'}
                      {c.pastUsageCount > 0 && `/ 過去実績: ${c.pastUsageCount}件`}
                    </p>
                  </>
                )}
                <div>
                  <button
                    type="button"
                    className={isSelected ? 'btn primary' : 'btn'}
                    onClick={() => onSelectShippingMethod(c.serviceName)}
                  >
                    {isSelected ? '選択中' : 'この配送方法を選択'}
                  </button>
                </div>
              </div>
            );
          })}

          {historyStatsCount === 0 && (
            <p className="subnote">
              既知の制限: 自社の過去発送実績(shipping_actuals)がまだ登録されていないため、送料は登録料金表のみに基づく参考値です。
            </p>
          )}

          {comparison && (
            <div style={{ marginTop: 4, padding: 12, borderRadius: 8, background: 'var(--panel-bg, #f8fafc)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>AIコメント</p>
              <p className="subnote" style={{ margin: '4px 0 0' }}>{comparison.reasonJa}</p>
              {comparison.riskNotesJa.length > 0 && (
                <ul className="subnote" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {comparison.riskNotesJa.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
              {comparison.alternativeServiceName && (
                <p className="subnote" style={{ margin: '4px 0 0' }}>次点候補: {comparison.alternativeServiceName}</p>
              )}
            </div>
          )}

          {recommendedCandidate && (
            <div style={{ marginTop: 4 }}>
              <p className="subnote" style={{ margin: 0 }}>
                eBay配送ポリシー:{' '}
                {suggestedPolicy ? (
                  <>
                    おすすめ「{suggestedPolicy.name}」
                    <button
                      type="button"
                      className="btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => onSelectFulfillmentPolicy(suggestedPolicy.policyId)}
                      disabled={fulfillmentPolicyId === suggestedPolicy.policyId}
                    >
                      {fulfillmentPolicyId === suggestedPolicy.policyId ? '使用中' : 'このポリシーを使用'}
                    </button>
                  </>
                ) : (
                  '対応するBusiness Policyの候補が見つかりませんでした。下のBusiness Policiesセクションから手動で選択してください。'
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
