'use client';

import { CONDITION_OPTIONS, type ConditionValue } from '@/types/listing';

/**
 * !!! REMOVE予定(§43, §116) !!!
 * §110 step8でDynamicConditionSection(eBay Metadata APIの動的Condition)を追加した。
 * こちらの固定6択版は、新しい方が本番で問題なく動くことを確認できたら削除する
 * (step6/7と同じ移行方針)。titleSuggestions.ts(タイトル候補生成)がまだ
 * このConditionValueに依存しているため、そちらの移行と合わせて削除する。
 */
export function ConditionSection({
  condition,
  onChange,
}: {
  condition: ConditionValue;
  onChange: (value: ConditionValue) => void;
}) {
  return (
    <section className="card">
      <div className="legend-row">
        <h2>2旧. eBayの状態(固定6択・廃止予定)</h2>
        <span className="hint">タイトル候補生成にのみ使用</span>
      </div>
      <p className="subnote">
        お客様に実際にお届けする商品の状態を選びます。eBayの出品フォームにある「Condition」の区分と同じものです。
      </p>
      <div className="pill-group">
        {CONDITION_OPTIONS.map((opt) => (
          <label className="pill" key={opt.value}>
            <input
              type="radio"
              name="condition"
              value={opt.value}
              checked={condition === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.labelJa}</span>
          </label>
        ))}
      </div>
      <p className="subnote">
        TODO(§43): カテゴリー確定後にeBay Metadata APIから取得した一覧に置き換える。
      </p>
    </section>
  );
}
