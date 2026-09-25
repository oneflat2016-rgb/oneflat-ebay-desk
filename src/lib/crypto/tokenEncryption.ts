import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * §9, §102: eBayのRefresh Token(ユーザーのeBayアカウントを操作できる強力な認証情報)を
 * DBへ平文で保存しないための暗号化ユーティリティ。AES-256-GCMを使用する。
 * TOKEN_ENCRYPTION_KEYは32byteの鍵をbase64で表した文字列(例: `openssl rand -base64 32`で生成)。
 * !!! この鍵が漏れるとRefresh Tokenの暗号化に意味が無くなるため、
 *     Vercelの環境変数以外に絶対に書き出さないこと(§102) !!!
 */

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded)');
  }
  return key;
}

/**
 * 暗号化結果は "v1.<iv(base64)>.<authTag(base64)>.<ciphertext(base64)>" 形式の文字列にする。
 * 先頭のバージョン識別子(v1)は、将来アルゴリズムを変更する際の互換性のため。
 */
export function encryptToken(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM推奨は96bit(12byte)
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptToken(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted token format');
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const authTag = Buffer.from(authTagB64!, 'base64');
  const ciphertext = Buffer.from(ciphertextB64!, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plainText = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plainText.toString('utf8');
}
