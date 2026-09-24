/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // 画像アップロードを見越して上限を広めに設定(必要に応じて調整)
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
