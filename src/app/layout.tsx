import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Mono, Noto_Sans_JP, Noto_Serif_JP, Public_Sans } from 'next/font/google';
import './globals.css';

/**
 * 2026-10-04: 「スマホでも使うことを想定しているので、もっと見た目をオシャレにしたい」
 * という要望への対応。
 * globals.cssは元々Fraunces/Public Sans/IBM Plex Mono/Noto Serif JP/Noto Sans JPを
 * 前提にデザインされていたが、実際にはどのフォントも読み込まれておらず、全端末で
 * ブラウザ標準フォント(Georgia/system-ui + OS既定の日本語フォント)にフォール
 * バックしていた(デザインが「薄く」見えていた最大の原因)。
 * next/font/googleで実際に読み込み、CSS変数経由でglobals.cssのフォントスタックへ
 * 反映する(欧文はFraunces/Public Sans/IBM Plex Mono、日本語はNoto Serif JP/
 * Noto Sans JPが文字ごとに補完し合う)。
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

const notoSerifJp = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-noto-serif-jp',
  display: 'swap',
});

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-public-sans',
  display: 'swap',
});

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ONEFLAT eBay Listing Desk',
  description: 'ONEFLAT社内向け eBay出品管理アプリ',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#8b3a5c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ja"
      className={`${fraunces.variable} ${notoSerifJp.variable} ${publicSans.variable} ${notoSansJp.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
