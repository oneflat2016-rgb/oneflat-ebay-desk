import type { ConditionValue } from '@/types/listing';

/**
 * TODO(§47-48): このヒューリスティック生成は暫定。
 * POST /api/ai/generate-title (Claude API, サーバー経由)に置き換える。
 * その際、事実確認できない語("RARE","Authentic","Mint","Tested & Working",
 * "Original","Vintage","Made in Japan"等)を無断で付与しないルールを
 * サーバー側プロンプトで担保すること。
 */

const CONDITION_TITLE_SHORT: Record<ConditionValue, string> = {
  New: 'New',
  'New – Open Box': 'New (Open Box)',
  'Used – Excellent': 'Used - Excellent',
  'Used – Good': 'Used - Good',
  'Used – Fair': 'Used - Fair',
  'For Parts / Not Working': 'For Parts / Repair',
};

export function buildTitleCandidates(params: {
  brand: string;
  model: string;
  keywords: string;
  condition: ConditionValue;
}): string[] {
  const { brand, model, keywords, condition } = params;
  const keywordList = keywords
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const condShort = CONDITION_TITLE_SHORT[condition] ?? 'Used';
  const isParts = condition === 'For Parts / Not Working';
  const base = [brand, model].filter(Boolean).join(' ') || '[Brand] [Model]';
  const k0 = keywordList[0] ?? (isParts ? 'Spares or Repair' : 'Tested & Working');
  const k1 = keywordList[1] ?? 'Fast Shipping';

  const candidates = [
    `${base} - ${condShort} - ${k0} - Ships from Japan`,
    `${base}${keywordList.length ? ' ' + keywordList.join(' ') : ''} | ${condShort} | From Japan`,
    `${isParts ? base : 'RARE ' + base} - ${condShort} - ${k0} - Japan Seller`,
    `${isParts ? '' : 'Authentic '}${base} (${k0}) - ${condShort} - Fast Shipping`,
    `${base} - ${condShort} Condition - ${k1} - From Japan`,
  ].map((t) => t.replace(/\s+/g, ' ').trim());

  const seen = new Set<string>();
  return candidates.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
}
