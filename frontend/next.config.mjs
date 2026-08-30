/** @type {import('next').NextConfig} */

// Resolve the API origin the server-side rewrite proxies to.
//
// The previous single-variable version fell back to 127.0.0.1 unconditionally,
// so on Vercel (where BACKEND_URL was never set) every /api/* request was
// rewritten to a loopback address and rejected by the platform with
// DNS_HOSTNAME_RESOLVED_PRIVATE. Falling back to NEXT_PUBLIC_BACKEND_URL means a
// deploy configured with either variable works, and localhost is only ever used
// outside production.
const backendUrl = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:8000')
).replace(/\/+$/, '');

if (!backendUrl) {
  // Loud at build time beats a silent 404 on every API call at runtime.
  console.warn(
    '[next.config] No BACKEND_URL or NEXT_PUBLIC_BACKEND_URL set for a production build — ' +
      '/api/* requests will 404. Set one in the Vercel project settings.'
  );
}

const nextConfig = {
  async rewrites() {
    if (!backendUrl) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
