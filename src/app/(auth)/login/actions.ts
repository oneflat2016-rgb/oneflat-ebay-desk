'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * §7: 社員は会社のeBayアカウントではなく、ONEFLAT個別アカウント(Supabase Auth)でログインする。
 * アカウント自体はADMINが管理画面(§91)から招待/作成する想定(Phase1では
 * Supabaseダッシュボードから手動作成でも可)。ここではサインインのみ扱う。
 *
 * NOTE: React 18安定版にはuseFormStateが無いため、エラー表示は
 * リダイレクト先のクエリパラメータで行う簡易実装にしている。
 */
export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!email || !password) {
    redirect(`/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // §102: rawエラーメッセージにSecretは含まれないが、詳細を出しすぎない
    redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  redirect(next || '/dashboard');
}

export async function signOut() {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
