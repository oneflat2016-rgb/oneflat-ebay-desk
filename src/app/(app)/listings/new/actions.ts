'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as productsRepo from '@/repositories/products';
import * as listingsRepo from '@/repositories/listings';
import type { ListingFormState } from '@/types/listing';

/**
 * §110 step3: products / listing_drafts のDB保存。
 * 今はUIの「保存」ボタンから呼ばれる手動保存(§80のdebounce自動保存は未実装)。
 * §81の楽観的排他制御(version)は実装済み: 保存時にversionが合わなければ
 * conflictを返し、UI側で「他の人が更新しました」と表示させる。
 */

export interface SaveListingIdentity {
  productId: string | null;
  productVersion: number | null;
  draftId: string | null;
  draftVersion: number | null;
}

export interface SaveListingResult {
  ok: boolean;
  identity?: SaveListingIdentity;
  conflict?: 'product' | 'draft';
  error?: 'not_authenticated' | 'unknown';
  savedAt?: string;
}

export async function saveListingDraft(
  identity: SaveListingIdentity,
  state: ListingFormState,
): Promise<SaveListingResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'not_authenticated' };
  }

  try {
    const productPatch = {
      brand: state.brand || null,
      model: state.model || null,
      aboutJa: state.about.ja || null,
      aboutEn: state.about.en || null,
      appearanceJa: state.appearance.ja || null,
      appearanceEn: state.appearance.en || null,
      conditionNotesJa: state.conditionDetail.ja || null,
      conditionNotesEn: state.conditionDetail.en || null,
      includedItemsJa: state.includedItems.ja || null,
      includedItemsEn: state.includedItems.en || null,
    };

    let productId = identity.productId;
    let productVersion = identity.productVersion;

    if (!productId) {
      const sku = await productsRepo.generateNextSku(profile.organizationId);
      const product = await productsRepo.createProduct({
        organizationId: profile.organizationId,
        sku,
        createdBy: profile.id,
        patch: productPatch,
      });
      productId = product.id;
      productVersion = product.version;
    } else {
      const result = await productsRepo.updateProductWithVersionCheck({
        id: productId,
        expectedVersion: productVersion ?? 1,
        patch: productPatch,
      });
      if (!result.ok) {
        return { ok: false, conflict: 'product' };
      }
      productVersion = result.record.version;
    }

    const draftPatch = {
      categoryName: state.category || null,
      conditionEnum: state.condition || null,
      title: state.title || null,
      updatedBy: profile.id,
    };

    let draftId = identity.draftId;
    let draftVersion = identity.draftVersion;

    if (!draftId) {
      const draft = await listingsRepo.createDraftForProduct({
        productId,
        createdBy: profile.id,
        patch: draftPatch,
      });
      draftId = draft.id;
      draftVersion = draft.version;
    } else {
      const result = await listingsRepo.updateDraftWithVersionCheck({
        id: draftId,
        expectedVersion: draftVersion ?? 1,
        patch: draftPatch,
      });
      if (!result.ok) {
        return { ok: false, conflict: 'draft' };
      }
      draftVersion = result.record.version;
    }

    await listingsRepo.upsertAspectValues(draftId, state.specifics);

    return {
      ok: true,
      identity: { productId, productVersion, draftId, draftVersion },
      savedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[saveListingDraft] failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'unknown' };
  }
}

/**
 * 既存の下書きを編集する画面(将来の一覧→編集フロー)向け。
 * 現状は new/page.tsx からは使われていない(常に新規作成扱い)。
 */
export async function loadListingDraft(draftId: string): Promise<{
  identity: SaveListingIdentity;
  productPatch: Awaited<ReturnType<typeof productsRepo.getProductById>>;
  draft: Awaited<ReturnType<typeof listingsRepo.getDraftById>>;
  specifics: Record<string, string>;
} | null> {
  const draft = await listingsRepo.getDraftById(draftId);
  if (!draft) return null;
  const product = await productsRepo.getProductById(draft.productId);
  if (!product) return null;
  const specifics = await listingsRepo.getAspectValuesForDraft(draftId);

  return {
    identity: {
      productId: product.id,
      productVersion: product.version,
      draftId: draft.id,
      draftVersion: draft.version,
    },
    productPatch: product,
    draft,
    specifics,
  };
}
