/**
 * TODO: 実装対象。listing_drafts / listing_aspect_values / listings のCRUD。
 * §80: debounce自動保存。§89-90: チェックリストのDB保存(inspected_by/at)。
 * §70: Publish開始時にstatus=PUBLISHINGへ変更するロック処理もここに置く。
 */
export async function saveDraft(): Promise<void> {
  throw new Error('saveDraft is not implemented yet (§80-82)');
}

export async function lockDraftForPublishing(_draftId: string): Promise<boolean> {
  throw new Error('lockDraftForPublishing is not implemented yet (§70)');
}
