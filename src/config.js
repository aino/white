// Generate 100 locales for stress testing
const languages = ['en', 'sv', 'de', 'fi', 'da', 'no', 'nl', 'fr', 'es', 'it', 'pt', 'pl', 'cs', 'hu', 'ro', 'bg', 'el', 'tr', 'ru', 'uk']
const countries = ['US', 'GB', 'SE', 'FI', 'DK', 'NO', 'NL', 'FR', 'ES', 'IT', 'PT', 'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'TR', 'RU', 'UA']

export const LOCALES = []
for (let i = 0; i < 100; i++) {
  const lang = languages[i % languages.length]
  const country = countries[Math.floor(i / languages.length) % countries.length]
  LOCALES.push(`${lang}-${country}`)
}

export const PORT = 4667
export const IMAGE_QUALITY = 90

// ISR Provider:
// - 'vercel': On-demand rendering with Vercel edge caching + tag invalidation
// - 'aws': CloudFront + Lambda@Edge + S3 (see ISR.md)
// - false: Static build, all HTML generated at build time
export const ISR = 'vercel'
