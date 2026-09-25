import { getSupabaseServerClient } from '@/lib/supabase/server';

export type Role = 'ADMIN' | 'LISTER' | 'CREATOR';

export interface CurrentProfile {
  id: string;
  organizationId: string;
  displayName: string;
  email: string;
  role: Role;
}

/**
 * §8: ADMIN/LISTER/CREATORのRole判定に使う共通ヘルパー。
 * Server Component / Route Handler / Server Actionから呼ぶ。
 * profilesテーブルにレコードが無い(=ADMINがまだ招待していない)場合はnullを返す。
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, organization_id, display_name, email, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    displayName: data.display_name,
    email: data.email,
    role: data.role as Role,
  };
}

/** §8: Roleごとの機能制限に使うガード。権限不足ならfalseを返すだけで例外は投げない。 */
export function hasRole(profile: CurrentProfile | null, allowed: Role[]): boolean {
  return !!profile && allowed.includes(profile.role);
}
