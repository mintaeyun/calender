/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // OAuth 승인 화면은 다른 사이트의 iframe 안에서 열리면 안 된다(클릭재킹 방지).
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default nextConfig;
