import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ProductAnalysis } from '@/types/ai';

/**
 * §25-26, §85: ai_runs / ai_suggestions テーブルのCRUD。
 * 同一input_hashでの再実行を避けるため、呼び出し前に findRunByInputHash() で
 * 既存の成功済みRunが無いか確認してから Claude API を呼ぶこと(§85)。
 */

export type AiPurpose =
  | 'analyze_product'
  | 'translate'
  | 'generate_title'
  | 'fill_aspects'
  | 'suggest_price'
  | 'suggest_shipping';

export interface AiRunRecord {
  id: string;
  productId: string | null;
  purpose: AiPurpose;
  model: string;
  inputHash: string;
  status: 'SUCCEEDED' | 'FAILED';
  createdAt: string;
}

export interface AiSuggestionInput {
  fieldName: string;
  suggestedValue: unknown;
  reason?: string;
  confidence: number;
}

export interface AiSuggestionRow {
  id: string;
  fieldName: string;
  suggestedValue: unknown;
  reason: string | null;
  confidence: number | null;
  createdAt: string;
}

function runFromRow(row: Record<string, unknown>): AiRunRecord {
  return {
    id: row.id as string,
    productId: (row.product_id as string) ?? null,
    purpose: row.purpose as AiPurpose,
    model: row.model as string,
    inputHash: row.input_hash as string,
    status: row.status as 'SUCCEEDED' | 'FAILED',
    createdAt: row.created_at as string,
  };
}

function suggestionFromRow(row: Record<string, unknown>): AiSuggestionRow {
  return {
    id: row.id as string,
    fieldName: row.field_name as string,
    suggestedValue: row.suggested_value_json,
    reason: (row.reason as string) ?? null,
    confidence: (row.confidence as number) ?? null,
    createdAt: row.created_at as string,
  };
}

/**
 * §85: 直近の成功済みRunをinput_hash一致で検索する(再実行防止・API課金の節約)。
 * 見つかった場合、呼び出し元はClaude APIを呼ばずそのSuggestionsを再利用してよい。
 */
export async function findSucceededRunByInputHash(
  purpose: AiPurpose,
  inputHash: string,
): Promise<{ run: AiRunRecord; suggestions: AiSuggestionRow[] } | null> {
  const supabase = getSupabaseServerClient();
  const { data: runRow, error } = await supabase
    .from('ai_runs')
    .select('*')
    .eq('purpose', purpose)
    .eq('input_hash', inputHash)
    .eq('status', 'SUCCEEDED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!runRow) return null;

  const run = runFromRow(runRow);
  const { data: suggestionRows, error: sError } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('ai_run_id', run.id);
  if (sError) throw sError;

  return { run, suggestions: (suggestionRows ?? []).map(suggestionFromRow) };
}

export async function createAiRun(params: {
  productId: string | null;
  purpose: AiPurpose;
  model: string;
  inputHash: string;
  inputTokens?: number;
  outputTokens?: number;
  status: 'SUCCEEDED' | 'FAILED';
  createdBy: string;
}): Promise<AiRunRecord> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('ai_runs')
    .insert({
      product_id: params.productId,
      purpose: params.purpose,
      model: params.model,
      input_hash: params.inputHash,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      status: params.status,
      created_by: params.createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return runFromRow(data);
}

export async function createAiSuggestions(
  aiRunId: string,
  productId: string | null,
  suggestions: AiSuggestionInput[],
): Promise<void> {
  if (suggestions.length === 0) return;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('ai_suggestions').insert(
    suggestions.map((s) => ({
      ai_run_id: aiRunId,
      product_id: productId,
      field_name: s.fieldName,
      suggested_value_json: s.suggestedValue,
      reason: s.reason ?? null,
      confidence: s.confidence,
    })),
  );
  if (error) throw error;
}

/**
 * ai_suggestions行の配列(§85の再利用ケース含む)を、ProductAnalysis形状に組み立てる。
 * analyze_product purposeのSuggestionsはfield_name = "brand"|"model"|"mpn"|"productType"|
 * "visibleText"|"includedItems"|"unknownFields" の想定。
 */
export function suggestionsToProductAnalysis(rows: AiSuggestionRow[]): ProductAnalysis {
  const byField = new Map(rows.map((r) => [r.fieldName, r]));
  const guess = (name: string) => {
    const row = byField.get(name);
    return {
      value: (row?.suggestedValue as string | null) ?? null,
      confidence: row?.confidence ?? 0,
      evidence: row?.reason ?? undefined,
    };
  };
  return {
    brand: guess('brand'),
    model: guess('model'),
    mpn: guess('mpn'),
    productType: guess('productType'),
    visibleText: (byField.get('visibleText')?.suggestedValue as string[]) ?? [],
    includedItems: (byField.get('includedItems')?.suggestedValue as string[]) ?? [],
    unknownFields: (byField.get('unknownFields')?.suggestedValue as string[]) ?? [],
  };
}
