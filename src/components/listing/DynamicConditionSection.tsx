'use client';

import { useEffect, useState } from 'react';
import type { EbayConditionPolicy } from '@/types/ebay';

/**
 * §43(§110 step8): eBay Metadata APIから取得した、選択済みカテゴリーの
 * Condition一覧の動的表示。固定6択(旧ConditionSection)は使わない(§117-3/§117-4)。
 */
export function DynamicConditionSection({
  categoryId,
  conditionId,
  onSelect,
}: {
  categoryId: string | null;
  conditionId: string | null;
  onSelect: (condition: { conditionId: string; conditionDescription: string }) => void;
}) {
  const [conditions, setConditions] = useState<EbayConditionPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: 'warn' | 'err' | '' }>({
    text: '',
    kind: '',
  });

  useEffect(() => {
    if (!categoryId) {
      setConditions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStatus({ text: '', kind: '' });
    fetch(`/api/ebay/conditions?categoryId=${encodeURIComponent(categoryId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ conditions: EbayConditionPolicy[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setConditions(data.conditions);
        if (data.conditions.length === 0) {
          setStatus({ text: 'このカテゴリーで選択できるConditionが見つかりませんでした。', kind: 'warn' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setConditions([]);
        setStatus({
          text:
            'Condition一覧が取得できませんでした。カテゴリーを選び直すか、あとでもう一度お試しください。' +
            (err instanceof Error ? ` (${err.message})` : ''),
          kind: 'err',
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return (
    <section className="card" id="dynamic-condition-section">
      <div className="legend-row">
        <h2>2. eBayの状態(Item Condition・eBayカテゴリー連動)</h2>
        <span className="hint">1.5.でeBayカテゴリーを選ぶと選択肢が表示されます</span>
      </div>
      <p className="subnote">
        1.5.で選んだeBayカテゴリーで実際に使用できるCondition(状態区分)のみが選択肢として表示されます。
      </p>

      {!categoryId ? (
        <p className="subnote">上の「1.5. eBayカテゴリー候補」でカテゴリーを選択すると、ここに選択肢が表示されます。</p>
      ) : loading ? (
        <p className="subnote">読み込んでいます…</p>
      ) : (
        <>
          {status.text && (
            <p className="subnote" style={{ color: status.kind === 'err' ? 'var(--danger)' : undefined }}>
              {status.text}
            </p>
          )}
          {conditions.length > 0 && (
            <div className="pill-group">
              {conditions.map((c) => (
                <label className="pill" key={c.conditionId}>
                  <input
                    type="radio"
                    name="ebay-condition"
                    value={c.conditionId}
                    checked={conditionId === c.conditionId}
                    onChange={() =>
                      onSelect({ conditionId: c.conditionId, conditionDescription: c.conditionDescription })
                    }
                  />
                  <span>{c.conditionDescription}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
