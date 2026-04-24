// In-memory cache for local ISR preview
// Simulates Vercel edge cache with tag-based invalidation

const cache = new Map() // path → { html, tags, timestamp, headers }
const tagIndex = new Map() // tag → Set<path>

export function get(path) {
  const entry = cache.get(path)
  if (!entry) return null

  const age = Math.floor((Date.now() - entry.timestamp) / 1000)
  return { ...entry, age }
}

export function set(path, html, tags = [], headers = {}) {
  cache.set(path, {
    html,
    tags,
    headers,
    timestamp: Date.now(),
  })

  for (const tag of tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set())
    }
    tagIndex.get(tag).add(path)
  }
}

export function invalidateByTags(tags) {
  const invalidated = []

  for (const tag of tags) {
    const paths = tagIndex.get(tag)
    if (!paths) continue

    for (const path of paths) {
      const entry = cache.get(path)
      if (entry) {
        cache.delete(path)
        invalidated.push(path)

        // Clean up tag index for this path
        for (const t of entry.tags) {
          tagIndex.get(t)?.delete(path)
        }
      }
    }
    tagIndex.delete(tag)
  }

  return [...new Set(invalidated)]
}

export function invalidateAll() {
  const count = cache.size
  cache.clear()
  tagIndex.clear()
  return count
}

export function stats() {
  return {
    entries: cache.size,
    tags: tagIndex.size,
    paths: [...cache.keys()],
  }
}
