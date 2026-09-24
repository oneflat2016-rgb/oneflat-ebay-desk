/**
 * §34, §98: AI関連の構造化型。
 * Claudeには「存在しない情報を作らせない」(§34) — 不明なら null。
 */
export interface AiFieldGuess<T = string> {
  value: T | null;
  confidence: number; // 0-1
  evidence?: string;
}

export interface ProductAnalysis {
  brand: AiFieldGuess;
  model: AiFieldGuess;
  mpn: AiFieldGuess;
  productType: AiFieldGuess;
  visibleText: string[];
  includedItems: string[];
  unknownFields: string[];
}

export interface AiSuggestionRecord<T = unknown> {
  fieldName: string;
  suggestedValue: T;
  reason?: string;
  confidence: number;
  accepted: boolean | null;
  finalValue?: T;
}
