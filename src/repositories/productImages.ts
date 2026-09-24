import { randomUUID } from 'crypto';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * product_images テーブル + Supabase Storage(`product-images`バケット)のCRUD。
 * Phase1-STEP4(§110 step4): スマホ/PCからの写真アップロード。
 * バケットは非公開(private)なので、表示には毎回signed URL(有効期限1時間)を発行する。
 * §102: アップロード前にファイル種別・サイズを検証すること(呼び出し元のServer Actionで実施)。
 */

const BUCKET = 'product-images';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export interface ProductImageRecord {
  id: string;
  productId: string;
  originalPath: string;
  sortOrder: number;
  isPrimary: boolean;
  imageType: string;
  createdAt: string;
}

export interface ProductImageWithUrl extends ProductImageRecord {
  url: string;
}

function fromRow(row: Record<string, unknown>): ProductImageRecord {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    originalPath: row.original_path as string,
    sortOrder: row.sort_order as number,
    isPrimary: row.is_primary as boolean,
    imageType: row.image_type as string,
    createdAt: row.created_at as string,
  };
}

export async function uploadImage(params: {
  organizationId: string;
  productId: string;
  uploadedBy: string;
  file: File;
}): Promise<ProductImageRecord> {
  const supabase = getSupabaseServerClient();

  const extFromName = params.file.name.split('.').pop();
  const ext = extFromName && extFromName.length <= 5 ? extFromName.toLowerCase() : 'jpg';
  const path = `${params.organizationId}/${params.productId}/${randomUUID()}.${ext}`;

  const bytes = await params.file.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: params.file.type || 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { count, error: countError } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', params.productId);
  if (countError) throw countError;
  const sortOrder = count ?? 0;

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: params.productId,
      original_path: path,
      sort_order: sortOrder,
      is_primary: sortOrder === 0,
      image_type: 'other',
      uploaded_by: params.uploadedBy,
    })
    .select('*')
    .single();

  if (error) {
    // DB行の作成に失敗した場合、孤立ファイルを残さないようStorage側もロールバックする
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  return fromRow(data);
}

export async function listImagesWithUrls(productId: string): Promise<ProductImageWithUrl[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []).map(fromRow);
  const results: ProductImageWithUrl[] = [];
  for (const row of rows) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.originalPath, SIGNED_URL_EXPIRY_SECONDS);
    if (signError) throw signError;
    results.push({ ...row, url: signed?.signedUrl ?? '' });
  }
  return results;
}

export async function deleteImage(imageId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { data: row, error: fetchError } = await supabase
    .from('product_images')
    .select('original_path')
    .eq('id', imageId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!row) return;

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([row.original_path as string]);
  if (storageError) throw storageError;

  const { error: deleteError } = await supabase.from('product_images').delete().eq('id', imageId);
  if (deleteError) throw deleteError;
}
