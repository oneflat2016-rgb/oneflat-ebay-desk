'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EbayBusinessPolicy, EbayInventoryLocation } from '@/types/ebay';

/**
 * §110 step10: eBay Sell Account API(Business Policies)+ Inventory API(保管場所)。
 * カテゴリーとは独立(出品者アカウント単位の情報)なので、フォーム表示時に一度だけ取得する。
 * §117-4: 選択肢は必ずeBayの応答から作る(アプリ側でダミーの選択肢を作らない)。
 */

interface SellerSetupResponse {
  fulfillmentPolicies: EbayBusinessPolicy[];
  paymentPolicies: EbayBusinessPolicy[];
  returnPolicies: EbayBusinessPolicy[];
  inventoryLocations: EbayInventoryLocation[];
  warnings: string[];
}

const emptyData: SellerSetupResponse = {
  fulfillmentPolicies: [],
  paymentPolicies: [],
  returnPolicies: [],
  inventoryLocations: [],
  warnings: [],
};

export function BusinessPoliciesSection({
  fulfillmentPolicyId,
  paymentPolicyId,
  returnPolicyId,
  merchantLocationKey,
  isAdmin,
  onChange,
}: {
  fulfillmentPolicyId: string | null;
  paymentPolicyId: string | null;
  returnPolicyId: string | null;
  merchantLocationKey: string | null;
  isAdmin: boolean;
  onChange: (patch: {
    fulfillmentPolicyId?: string | null;
    paymentPolicyId?: string | null;
    returnPolicyId?: string | null;
    merchantLocationKey?: string | null;
  }) => void;
}) {
  const [data, setData] = useState<SellerSetupResponse>(emptyData);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [showCreateLocation, setShowCreateLocation] = useState(false);

  // §110 step11の運用改善(2026-09-25追加): このアプリからeBayへ書き込む値は
  // 必ず商品(下書き)ごとに明示選択させる方針(§117-4)だが、実際の運用では
  // ONEFLATが各種類ごとに1件しかポリシー/保管場所を持たないことが多いため、
  // 「候補が1件しかない」場合に限り、未選択の欄へ自動的にその1件を選択する
  // (=eBay側の設定をそのまま拾う)。候補が2件以上ある場合は誤った推測を避け、
  // 引き続き手動選択のままにする。propsの最新値はrefで参照する(loadはuseCallbackで
  // 一度だけ生成されるため、クロージャ内で直接propsを参照すると古い値のままになる)。
  const latest = useRef({
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId,
    merchantLocationKey,
    onChange,
  });
  useEffect(() => {
    latest.current = { fulfillmentPolicyId, paymentPolicyId, returnPolicyId, merchantLocationKey, onChange };
  });

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    fetch('/api/ebay/policies')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<SellerSetupResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);

        const current = latest.current;
        const autoPatch: Parameters<typeof current.onChange>[0] = {};
        const singleFulfillment = json.fulfillmentPolicies.length === 1 ? json.fulfillmentPolicies[0] : undefined;
        if (!current.fulfillmentPolicyId && singleFulfillment) {
          autoPatch.fulfillmentPolicyId = singleFulfillment.policyId;
        }
        const singlePayment = json.paymentPolicies.length === 1 ? json.paymentPolicies[0] : undefined;
        if (!current.paymentPolicyId && singlePayment) {
          autoPatch.paymentPolicyId = singlePayment.policyId;
        }
        const singleReturn = json.returnPolicies.length === 1 ? json.returnPolicies[0] : undefined;
        if (!current.returnPolicyId && singleReturn) {
          autoPatch.returnPolicyId = singleReturn.policyId;
        }
        const singleLocation = json.inventoryLocations.length === 1 ? json.inventoryLocations[0] : undefined;
        if (!current.merchantLocationKey && singleLocation) {
          autoPatch.merchantLocationKey = singleLocation.merchantLocationKey;
        }
        if (Object.keys(autoPatch).length > 0) {
          current.onChange(autoPatch);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setData(emptyData);
        setErrorMessage(err instanceof Error ? err.message : '取得に失敗しました。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load, reloadKey]);

  return (
    <section className="card" id="business-policies-section">
      <div className="legend-row">
        <h2>9. eBay Business Policies・保管場所(§110 step10)</h2>
        <span className="hint">出品者アカウント単位の設定</span>
      </div>
      <p className="subnote">
        配送・支払い・返品ポリシー、および商品の発送元(保管場所)は、いずれもADMINが連携したeBayアカウント側の設定から選びます。
        アプリ側で新しいポリシーは作成できません(ポリシー自体はeBayの「Business Policies」画面で管理してください)。
        各種類につき候補が1件しかない場合は自動的に選択されます(2件以上ある場合は手動で選んでください)。
      </p>

      {loading ? (
        <p className="subnote">読み込んでいます…</p>
      ) : errorMessage ? (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {errorMessage}
          {errorMessage.includes('連携されていません') && (
            <>
              {' '}
              <a href="/settings">/settings</a> からADMINが連携してください。
            </>
          )}
        </p>
      ) : (
        <>
          {data.warnings.length > 0 && (
            <>
              <ul className="subnote" style={{ color: 'var(--danger)' }}>
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {isAdmin && data.warnings.some((w) => w.includes('not eligible for Business Policy')) && (
                <BusinessPolicyOptIn onDone={() => setReloadKey((k) => k + 1)} />
              )}
            </>
          )}

          <PolicySelect
            label="配送ポリシー(Fulfillment Policy)"
            policies={data.fulfillmentPolicies}
            value={fulfillmentPolicyId}
            onChange={(v) => onChange({ fulfillmentPolicyId: v })}
            isAdmin={isAdmin}
            kind="FULFILLMENT"
            onCreated={() => setReloadKey((k) => k + 1)}
          />
          <PolicySelect
            label="支払いポリシー(Payment Policy)"
            policies={data.paymentPolicies}
            value={paymentPolicyId}
            onChange={(v) => onChange({ paymentPolicyId: v })}
            isAdmin={isAdmin}
            kind="PAYMENT"
            onCreated={() => setReloadKey((k) => k + 1)}
          />
          <PolicySelect
            label="返品ポリシー(Return Policy)"
            policies={data.returnPolicies}
            value={returnPolicyId}
            onChange={(v) => onChange({ returnPolicyId: v })}
            isAdmin={isAdmin}
            kind="RETURN"
            onCreated={() => setReloadKey((k) => k + 1)}
          />

          <div className="field">
            <label htmlFor="merchant-location">発送元(Inventory Location)</label>
            {data.inventoryLocations.length === 0 ? (
              <p className="subnote">登録済みの保管場所がありません。</p>
            ) : (
              <select
                id="merchant-location"
                value={merchantLocationKey ?? ''}
                onChange={(e) => onChange({ merchantLocationKey: e.target.value || null })}
              >
                <option value="">選択してください</option>
                {data.inventoryLocations.map((loc) => (
                  <option key={loc.merchantLocationKey} value={loc.merchantLocationKey}>
                    {(loc.name ?? loc.merchantLocationKey) +
                      (loc.city ? `(${loc.city})` : '') +
                      (loc.locationStatus !== 'ENABLED' ? ` [${loc.locationStatus}]` : '')}
                  </option>
                ))}
              </select>
            )}

            {isAdmin && (
              <>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowCreateLocation((v) => !v)}
                >
                  {showCreateLocation ? '閉じる' : '＋ 新しい保管場所を登録'}
                </button>
                {showCreateLocation && (
                  <CreateLocationForm
                    onCreated={() => {
                      setShowCreateLocation(false);
                      setReloadKey((k) => k + 1);
                    }}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PolicySelect({
  label,
  policies,
  value,
  onChange,
  isAdmin,
  kind,
  onCreated,
}: {
  label: string;
  policies: EbayBusinessPolicy[];
  value: string | null;
  onChange: (value: string | null) => void;
  isAdmin: boolean;
  kind: 'FULFILLMENT' | 'PAYMENT' | 'RETURN';
  onCreated: () => void;
}) {
  const id = `policy-${label}`;
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {policies.length === 0 ? (
        <p className="subnote">
          このアカウントでは{label}が見つかりませんでした。eBayの「Business Policies」設定で作成してください。
        </p>
      ) : (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">選択してください</option>
          {policies.map((p) => (
            <option key={p.policyId} value={p.policyId}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {isAdmin && (
        <>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? '閉じる' : `＋ 新しい${label}を登録`}
          </button>
          {showCreate && (
            <CreatePolicyForm
              kind={kind}
              onCreated={() => {
                setShowCreate(false);
                onCreated();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function CreatePolicyForm({
  kind,
  onCreated,
}: {
  kind: 'FULFILLMENT' | 'PAYMENT' | 'RETURN';
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [handlingTimeDays, setHandlingTimeDays] = useState('3');
  const [returnPeriodDays, setReturnPeriodDays] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/ebay/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          name,
          handlingTimeDays: Number(handlingTimeDays) || 3,
          returnPeriodDays: Number(returnPeriodDays) || 30,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      {kind === 'FULFILLMENT' && (
        <p className="subnote">
          国内発送・送料無料(USPS Priority)の簡易な配送ポリシーを作成します。詳細な条件はeBay側で別途調整してください。
        </p>
      )}
      {kind === 'PAYMENT' && <p className="subnote">eBayの標準的な支払い方法(Managed Payments)をそのまま使う支払いポリシーを作成します。</p>}
      {kind === 'RETURN' && <p className="subnote">返品可・返品送料は購入者負担の簡易な返品ポリシーを作成します。</p>}

      <div className="field">
        <label htmlFor={`policy-name-${kind}`}>ポリシー名</label>
        <input id={`policy-name-${kind}`} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {kind === 'FULFILLMENT' && (
        <div className="field">
          <label htmlFor="handling-time">発送までの日数(Handling Time)</label>
          <input
            id="handling-time"
            type="number"
            min={1}
            value={handlingTimeDays}
            onChange={(e) => setHandlingTimeDays(e.target.value)}
          />
        </div>
      )}
      {kind === 'RETURN' && (
        <div className="field">
          <label htmlFor="return-period">返品受付期間(日)</label>
          <input
            id="return-period"
            type="number"
            min={1}
            value={returnPeriodDays}
            onChange={(e) => setReturnPeriodDays(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button type="button" className="btn primary" disabled={submitting || !name.trim()} onClick={handleSubmit}>
        {submitting ? '登録しています…' : '登録する'}
      </button>
    </div>
  );
}

function BusinessPolicyOptIn({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/ebay/business-policies-opt-in', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="subnote">
        このeBayアカウントはまだ「Business Policies」プログラムに加入していないため、配送/支払い/返品ポリシーが1件も表示されません。
        下のボタンで加入手続きができます(eBayのアカウント設定画面から行うのと同じ操作です)。
      </p>
      <button type="button" className="btn primary" disabled={submitting} onClick={handleClick}>
        {submitting ? '加入しています…' : 'Business Policiesに加入する'}
      </button>
      {error && (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function CreateLocationForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    merchantLocationKey: '',
    name: '',
    addressLine1: '',
    city: '',
    stateOrProvince: '',
    postalCode: '',
    country: 'JP',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/ebay/inventory-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <p className="subnote">
        通常はONEFLATの発送拠点を1件登録すれば十分です。Location Key(半角英数字、他と重複しないID)は
        「oneflat-main」のような分かりやすいものにしてください。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        <div className="field">
          <label htmlFor="loc-key">Location Key(ID・半角英数字)</label>
          <input
            id="loc-key"
            value={form.merchantLocationKey}
            onChange={(e) => update('merchantLocationKey', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-name">名称</label>
          <input id="loc-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-address1">住所(番地まで)</label>
          <input
            id="loc-address1"
            value={form.addressLine1}
            onChange={(e) => update('addressLine1', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-city">市区町村</label>
          <input id="loc-city" value={form.city} onChange={(e) => update('city', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-state">都道府県</label>
          <input
            id="loc-state"
            value={form.stateOrProvince}
            onChange={(e) => update('stateOrProvince', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="loc-postal">郵便番号</label>
          <input id="loc-postal" value={form.postalCode} onChange={(e) => update('postalCode', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="loc-country">国コード(ISO、例: JP)</label>
          <input id="loc-country" value={form.country} onChange={(e) => update('country', e.target.value)} />
        </div>
      </div>
      {error && (
        <p className="subnote" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <button type="button" className="btn primary" disabled={submitting} onClick={handleSubmit}>
        {submitting ? '登録しています…' : '登録する'}
      </button>
    </div>
  );
}
