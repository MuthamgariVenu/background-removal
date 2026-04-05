/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
  // TensorFlow.js packages are ESM and need to be transpiled by Next.js
  transpilePackages: [
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-backend-webgl",
    "@tensorflow/tfjs-backend-cpu",
    "@tensorflow/tfjs-converter",
    "@tensorflow-models/body-segmentation",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // tf.js uses 'fs' — tell webpack it's not available in browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
