export const LOCALES = [
  'en-US', // English (United States)
  'en-GB', // English (United Kingdom)
  'en-SE', // English (Sweden)
  'en-FI', // English (Finland)
  'sv-SE', // Swedish (Sweden)
  'sv-FI', // Swedish (Finland)
  'de-DE', // German (Germany)
  'de-AT', // German (Austria)
  'de-CH', // German (Switzerland)
  'fi-FI', // Finnish (Finland)
]
export const PORT = 4667
export const IMAGE_QUALITY = 90

// ISR Provider:
// - 'vercel': On-demand rendering with Vercel edge caching + tag invalidation
// - 'aws': CloudFront + Lambda@Edge + S3 (see ISR.md)
// - false: Static build, all HTML generated at build time
export const ISR = 'vercel'
