import { writeFileSync } from 'fs'
import { join } from 'path'
import { LOCALES } from '../../src/config.js'

const routes = []

const config = {
  framework: 'vite',
  outputDirectory: 'dist',
  images: {
    domains: [],
    minimumCacheTTL: 60,
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowSVG: true,
    sizes: [160, 320, 640, 960, 1280, 1600, 1920, 2240],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  routes,
}

export default async function vercelConfig() {
  writeFileSync(
    join(process.cwd(), '/vercel.dev.json'),
    JSON.stringify(config, null, 2)
  )
  config.routes.push(
    { handle: 'filesystem' },
    {
      src: `^/(${LOCALES.slice(1).join('|')})(/|/.*)?$`,
      status: 404,
      dest: '/$1/404/index.html',
    },
    {
      src: '/.*',
      status: 404,
      dest: '/404/index.html',
    }
  )
  writeFileSync(
    join(process.cwd(), '/vercel.json'),
    JSON.stringify(config, null, 2)
  )
  console.log('Created vercel.json and vercel.dev.json')
}
