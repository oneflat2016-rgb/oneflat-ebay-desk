import { redirect } from 'next/navigation';

/**
 * §30: 本来はホーム画面(ダッシュボード)を表示する。
 */
export default function RootPage() {
  redirect('/dashboard');
}
