import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ❗ Next no va a parar el build si hay errores de ESLint
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
