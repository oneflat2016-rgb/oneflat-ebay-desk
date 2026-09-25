/**
 * §9(§110 step9): eBay Commerce Identity API。
 * 連携直後にeBay側のユーザーID(ebay_accounts.ebay_user_id, 表示用)を
 * 取得するためだけに使う(User Access Tokenが必要)。
 * 注意: Identity APIのホストは他のAPIと異なり "apiz." プレフィックスになる。
 */
function getEbayIdentityApiBaseUrl(): string {
  return process.env.EBAY_ENV === 'production'
    ? 'https://apiz.ebay.com'
    : 'https://apiz.sandbox.ebay.com';
}

export async function getEbayUserIdentity(
  userAccessToken: string,
): Promise<{ userId: string; username: string | null }> {
  const res = await fetch(`${getEbayIdentityApiBaseUrl()}/commerce/identity/v1/user/`, {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay Identity API failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { userId?: string; username?: string };
  return { userId: json.userId ?? '', username: json.username ?? null };
}
