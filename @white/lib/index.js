import { resolve } from 'path'
import fullReload from 'vite-plugin-full-reload'
import { ViteMinifyPlugin } from 'vite-plugin-minify'
import eslint from 'vite-plugin-eslint'
import dynamicFilesPlugin from './dynamicFilesPlugin.js'
import virtualHtmlPlugin from './virtualHtmlPlugin.js'
import dynamicImageResizePlugin from './dynamicImagesPlugin.js'
import virtualScriptsPlugin from './virtualScriptsPlugin.js'
import virtualAutoCssPlugin from './virtualAutoCssPlugin.js'
import virtualComponentsPlugin from './virtualComponentsPlugin.js'
import jsxRuntimeInjector from './jsxRuntimeInjector.js'
import customJsxTransform from './customJsxTransform.js'
import localizedHrefPlugin from './localizedHrefPlugin.js'
import jsxToHtmlPlugin from './jsxToHtmlPlugin.js'
import preloadImageMetadata from './preloadImageMetaData.js'
import getDynamicRoutes from './getDynamicRoutes.js'
import viteCompression from 'vite-plugin-compression'
import { API_PORT } from './ports.js'

export const PAGES_DIR = 'src/pages'

export const getPath = (name) =>
  name === 'home' ? `index.html` : `${name}/index.html`

export default (async () => {
  const { input, dynamicPaths } = await getDynamicRoutes()
  const imageMetadataCache = await preloadImageMetadata()

  return {
    plugins: [
      /*
      viteCompression({
        algorithm: 'brotliCompress',
      }),
      */
      ...(process.env.NODE_ENV !== 'production'
        ? [
            eslint({
              cache: false,
            }),
          ]
        : []),
      customJsxTransform(),
      jsxToHtmlPlugin(),
      virtualScriptsPlugin(),
      virtualAutoCssPlugin(),
      virtualComponentsPlugin(),
      jsxRuntimeInjector(),
      fullReload([`${PAGES_DIR}/**/*.jsx`]),
      virtualHtmlPlugin(),
      dynamicImageResizePlugin(imageMetadataCache),
      dynamicFilesPlugin(dynamicPaths),
      localizedHrefPlugin(),
      ViteMinifyPlugin({}),
    ],
    root: 'src/pages',
    resolve: {
      alias: {
        src: resolve(__dirname, '../../src'),
        '@white': resolve(__dirname, '..'),
        '@white/utils': resolve(__dirname, '../utils'),
        'lib/jsx-runtime': resolve(__dirname, 'jsx-runtime.js'),
      },
    },
    esbuild: {
      jsx: 'preserve',
    },
    css: {
      transformer: 'lightningcss',
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
    publicDir: '../../src/public',
    envPrefix: ['VITE_', 'VERCEL'],
    build: {
      target: 'es2018',
      outDir: '../../dist',
      emptyOutDir: true,
      minify: 'terser', // Use terser for smaller bundles
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.warn'], // Remove specific console calls
          passes: 2, // Run compression twice for better results
        },
        mangle: {
          toplevel: true, // Mangle top-level variable names
        },
      },
      rollupOptions: {
        input,
        output: {
          chunkFileNames: 'assets/[hash].js',
          entryFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
          manualChunks: {
            // Bundle all scripts together instead of splitting them
            scripts: ['white/scripts'],
          },
        },
      },
    },
  }
})()
