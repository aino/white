// Default exclusions for development/asset paths
const DEFAULT_EXCLUSIONS = [
  '/@',               // All Vite internal routes (@fs, @vite, @id, etc.)
  '/assets',          // Built assets
]

// File extensions to exclude
const EXCLUDED_EXTENSIONS = [
  '.css', '.js', '.jsx', '.ts', '.tsx',
  '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot',
  '.json', '.xml', '.txt', '.pdf', '.zip'
]

// Utility to check if a path matches Vercel middleware matcher patterns
export function matchesMiddleware(pathname, userMatchers = []) {
  // Check if path starts with excluded directories
  const isDirectoryExcluded = DEFAULT_EXCLUSIONS.some(excludedDir => {
    return pathname.startsWith(excludedDir)
  })
  
  if (isDirectoryExcluded) {
    return false
  }
  
  // Check if path has excluded file extension
  const hasExcludedExtension = EXCLUDED_EXTENSIONS.some(ext => {
    return pathname.endsWith(ext)
  })
  
  if (hasExcludedExtension) {
    return false
  }
  
  // Exclude hidden files (starting with /.)
  if (pathname.startsWith('/.')) {
    return false
  }
  
  // If no user matchers, run on all non-excluded paths
  if (!userMatchers || userMatchers.length === 0) {
    return true
  }

  // Check user-defined matchers
  return userMatchers.some(matcher => {
    // Handle glob patterns and regex patterns
    if (matcher.startsWith('/') && matcher.includes('(')) {
      // Regex pattern - convert to RegExp
      try {
        // Remove leading and trailing slashes for RegExp constructor
        let pattern = matcher
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          pattern = pattern.slice(1, -1)
        } else if (pattern.startsWith('/')) {
          pattern = pattern.slice(1)
        }
        
        const regex = new RegExp(pattern)
        const matches = regex.test(pathname)
        // Uncomment for debugging: console.log(`Pattern: ${pattern}, Path: ${pathname}, Matches: ${matches}`)
        return matches
      } catch (e) {
        console.warn('Invalid regex matcher:', matcher, e.message)
        return false
      }
    } else {
      // Simple glob pattern matching
      const pattern = matcher.replace(/\*/g, '.*')
      const regex = new RegExp(`^${pattern}$`)
      return regex.test(pathname)
    }
  })
}