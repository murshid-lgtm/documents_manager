/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  productionBrowserSourceMaps:false,
  async headers(){
    const contentSecurityPolicy=[
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "worker-src 'self' blob:",
      "media-src 'self' blob:",
      "manifest-src 'self'",
      'upgrade-insecure-requests'
    ].join('; ');
    return [{source:'/:path*',headers:[
      {key:'Content-Security-Policy',value:contentSecurityPolicy},
      {key:'Strict-Transport-Security',value:'max-age=63072000; includeSubDomains'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'Referrer-Policy',value:'no-referrer'},
      {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=(), payment=(), usb=()'},
      {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
      {key:'Cross-Origin-Resource-Policy',value:'same-origin'}
    ]}];
  }
};
export default nextConfig;
