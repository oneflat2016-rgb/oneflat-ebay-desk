'use server';

import { getCurrentProfile } from '@/lib/auth/getCurrentProfile';
import * as productsRepo from '@/repositories/products';
import * as listingsRepo from '@/repositories/listings';
import * as productImagesRepo from '@/repositories/productImages';
import type { ListingFormState } from '@/types/listing';
import type { ProductImageWithUrl } from '@/repositories/productImages';
import type { EbayAspectDefinition } from '@/types/ebay';

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
  ebayAspectDefinitions: EbayAspectDefinition[] = [],
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
      categoryTreeId: state.categoryTreeId,
      categoryId: state.categoryId,
      categoryName: state.categoryName ?? (state.category || null),
      // §43(§110 step8): eBay Metadata API由来のConditionを優先保存する。
      // 未選択の間(旧固定6択のみ入力済みの場合)はconditionEnumに旧値をフォールバックする
      // (併用期間中、§117-4: eBay由来でない値をconditionIdへは入れない)。
      conditionId: state.ebayConditionId,
      conditionEnum: state.ebayConditionDescription ?? (state.condition || null),
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

    // §39-42(§110 step7): eBay Taxonomy API由来のItem Specifics。
    // 選択中カテゴリーのAspect定義(ebayAspectDefinitions)がまだ画面側で
    // 取得できていない(=カテゴリー未選択、またはロード前)場合は何もしない。
    if (ebayAspectDefinitions.length > 0) {
      await listingsRepo.upsertEbayAspectValues(draftId, ebayAspectDefinitions, state.aspectValues);
    }

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
 * §110 step4: スマホ/PCから撮影・選択した写真をSupabase Storageへアップロードする。
 * §102: アップロード前にファイル種別・サイズを必ず検証する(未検証の入力を信用しない)。
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

export interface UploadImageResult {
  ok: boolean;
  image?: ProductImageWithUrl;
  error?: 'not_authenticated' | 'invalid_file' | 'invalid_type' | 'too_large' | 'unknown';
}

export async function uploadProductImage(
  productId: string,
  formData: FormData,
): Promise<UploadImageResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'not_authenticated' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'invalid_file' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'invalid_type' };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'too_large' };

  try {
    const record = await productImagesRepo.uploadImage({
      organizationId: profile.organizationId,
      productId,
      uploadedBy: profile.id,
      file,
    });
    const [withUrl] = await productImagesRepo.listImagesWithUrls(productId).then((rows) =>
      rows.filter((r) => r.id === record.id),
    );
    return { ok: true, image: withUrl };
  } catch (err) {
    console.error('[uploadProductImage] failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'unknown' };
  }
}

export async function listProductImages(productId: string): Promise<ProductImageWithUrl[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  return productImagesRepo.listImagesWithUrls(productId);
}

export async function deleteProductImage(
  imageId: string,
): Promise<{ ok: boolean; error?: 'not_authenticated' | 'unknown' }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'not_authenticated' };
  try {
    await productImagesRepo.deleteImage(imageId);
    return { ok: true };
  } catch (err) {
    console.error('[deleteProductImage] failed', err instanceof Error ? err.message : err);
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
  aspectValues: Record<string, string[]>;
} | null> {
  const draft = await listingsRepo.getDraftById(draftId);
  if (!draft) return null;
  const product = await productsRepo.getProductById(draft.productId);
  if (!product) return null;
  const specifics = await listingsRepo.getAspectValuesForDraft(draftId);
  const aspectValues = await listingsRepo.getEbayAspectValuesForDraft(draftId);

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
    aspectValues,
  };
}
