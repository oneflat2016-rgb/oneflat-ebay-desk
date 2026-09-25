import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * §110 step11の追加修正(2026-09-25): eBay Sell Inventory APIの
 * PictureURL制限(1件あたり500文字以内、合計3975文字以内。errorId 25015で実機確認済み)に
 * 対応するための短縮リダイレクトURL。
 *
 * Supabase Storageの署名付きURL(createSignedUrl)はトークンを含むため500文字を
 * 簡単に超えてしまう。そこでeBayへ渡すURLはこの短い固定パス
 * (`/api/ebay-image/{product_images.id}`)にし、実際のアクセス時にここで
 * 署名付きURLへ302リダイレクトする(eBay側のクローラーはリダイレクトを追跡して
 * 画像を取得する)。
 *
 * §29,§102: この経路はeBayのサーバーから認証情報無しで叩かれるため、ログインセッションに
 * 依存するanonクライアントではRLSにより行を取得できない。そのため
 * getSupabaseAdminClient()(service_role)を使うが、公開するのは
 * 「指定されたimageIdの画像1件へのリダイレクトのみ」に限定し、他のデータには
 * 一切アクセスしない。imageIdはproduct_images.id(ランダムなUUID)なので
 * 推測されるリスクは実務上無視できる(§102: とはいえ将来的に画像URLの有効期限付き
 * トークンなど、より厳密な仕組みへの置き換えは検討の余地あり)。
 */
const BUCKET = 'product-images';
const SIGNED_URL_EXPIRY_SECONDS = 60 * 10; // リダイレクト直後に使うだけなので短くてよい

export async function GET(_req: Request, { params }: { params: { imageId: string } }) {
  const { imageId } = params;
  if (!imageId) {
    return NextResponse.json({ message: 'imageIdが指定されていません。' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: row, error } = await supabase
      .from('product_images')
      .select('original_path')
      .eq('id', imageId)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      return NextResponse.json({ message: '画像が見つかりません。' }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.original_path as string, SIGNED_URL_EXPIRY_SECONDS);
    if (signError) throw signError;
    if (!signed?.signedUrl) {
      return NextResponse.json({ message: '画像URLの発行に失敗しました。' }, { status: 500 });
    }

    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  } catch (err) {
    console.error('[api/ebay-image] failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ message: '画像の取得に失敗しました。' }, { status: 502 });
  }
}
