const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Node-only packages loaded at runtime instead of bundled (`ws` and the
  // OpenClaw gateway client resolve their internals with dynamic requires).
  serverExternalPackages: ['ws', '@openclaw/gateway-client', '@openclaw/gateway-protocol'],
  transpilePackages: ['@taia/types', '@taia/core', '@taia/domain', '@taia/runtime'],
}
module.exports = withNextIntl(nextConfig)
