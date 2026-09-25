'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  deleteProductImage,
  listProductImages,
  uploadProductImage,
} from '@/app/(app)/listings/new/actions';
import type { ProductImageWithUrl } from '@/repositories/productImages';

/**
 * §110 step4: スマホ/PCから商品写真を撮影・選択してアップロードするセクション。
 * まだ「保存」を一度も押していない(productIdが無い)間はアップロードできない
 * (product_imagesはproductsに外部キーで紐づくため)。
 * `accept="image/*"` のみでcapture属性は付けていない
 * (スマホでは「写真を撮る/ライブラリから選ぶ」の選択肢が出て、PCでは通常のファイル選択になる)。
 */
export function ImagesSection({ productId }: { productId: string | null }) {
  const [images, setImages] = useState<ProductImageWithUrl[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!productId) {
      setImages([]);
      return;
    }
    setIsLoading(true);
    listProductImages(productId)
      .then((rows) => setImages(rows))
      .catch(() => setError('画像一覧の取得に失敗しました。'))
      .finally(() => setIsLoading(false));
  }, [productId]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!productId || !fileList || fileList.length === 0) return;
    setError(null);
    const files = Array.from(fileList);

    startUpload(async () => {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const result = await uploadProductImage(productId, formData);
        if (!result.ok || !result.image) {
          if (result.error === 'too_large') {
            setError(`「${file.name}」は8MBを超えているためアップロードできません。`);
          } else if (result.error === 'invalid_type') {
            setError(`「${file.name}」は画像ファイルではありません。`);
          } else {
            setError('アップロードに失敗しました。もう一度お試しください。');
          }
          continue;
        }
        setImages((prev) => [...prev, result.image as ProductImageWithUrl]);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleDelete(imageId: string) {
    startUpload(async () => {
      const result = await deleteProductImage(imageId);
      if (result.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      } else {
        setError('削除に失敗しました。もう一度お試しください。');
      }
    });
  }

  return (
    <section className="card">
      <div className="legend-row">
        <h2 style={{ fontSize: '1.05rem' }}>0. 商品写真</h2>
        <span className="hint">複数角度から撮影してください</span>
      </div>

      {!productId ? (
        <p className="subnote">
          写真を追加するには、先に下の「保存」ボタンを1回押して商品を登録してください(登録後にこの欄が使えるようになります)。
        </p>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={isUploading}
            onChange={(e) => handleFilesSelected(e.target.files)}
            style={{ marginBottom: 12 }}
          />

          {isLoading && <p className="subnote">読み込み中…</p>}
          {error && (
            <p className="subnote" style={{ color: '#c0392b' }}>
              {error}
            </p>
          )}

          {images.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gap: 10,
                marginTop: 10,
              }}
            >
              {images.map((img) => (
                <div key={img.id} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URLは動的なのでnext/imageの最適化対象外 */}
                  <img
                    src={img.url}
                    alt=""
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: img.isPrimary ? '2px solid var(--accent)' : '1px solid var(--line)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id)}
                    disabled={isUploading}
                    aria-label="削除"
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(0,0,0,.65)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      lineHeight: '20px',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
