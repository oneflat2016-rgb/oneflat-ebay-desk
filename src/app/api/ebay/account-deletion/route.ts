import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * eBay「Marketplace Account Deletion/Closure」通知の受信窓口。
 * 本番用キー(Production keyset)を有効にするためにeBayが要求する。
 *
 * - GET  ?challenge_code=xxx : eBayが窓口の持ち主かを確かめる。
 *   SHA-256(challengeCode + verificationToken + endpoint) を16進で返す。
 * - POST : 退会した利用者の通知。受け取ったら200を返す。
 *
 * 必要な環境変数(値はコードに書かない):
 *   EBAY_VERIFICATION_TOKEN        … eBayの設定画面に入力した確認用の合言葉(32〜80文字の英数字/_/-)
 *   EBAY_ACCOUNT_DELETION_ENDPOINT … eBayに登録した、この窓口の完全なURL(https://〜)
 */

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const challengeCode = new URL(req.url).searchParams.get('challenge_code');
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_ACCOUNT_DELETION_ENDPOINT;

  if (!challengeCode) {
    return NextResponse.json({ message: 'challenge_code が必要です。' }, { status: 400 });
  }
  if (!verificationToken || !endpoint) {
    console.error('[ebay/account-deletion] 環境変数が未設定です');
    return NextResponse.json({ message: '窓口の設定が完了していません。' }, { status: 500 });
  }

  const challengeResponse = createHash('sha256')
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest('hex');

  return NextResponse.json({ challengeResponse }, { status: 200 });
}

export async function POST(req: Request) {
  // 個人情報を含みうるため、本文はログに出さない。受信した事実だけ記録する。
  try {
    await req.json();
  } catch {
    /* 本文が読めなくても200を返す(eBayの再送を避ける) */
  }
  console.log('[ebay/account-deletion] 退会通知を受信しました');
  return new NextResponse(null, { status: 200 });
}
