// Simple memo module for browser and Node.js environments
export const { memo, flushCache } = (() => {
  const cache = new Map() // Store cached results
  const pendingPromises = new Map() // Store ongoing promises

  // Generate a hash for the function and its arguments
  function generateHash(func) {
    const funcString = func.toString()
    let hash = 0
    for (let i = 0; i < funcString.length; i++) {
      const char = funcString.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0 // Convert to 32bit integer
    }
    return hash.toString()
  }

  // Main memoization function
  async function memo(func, ttl = Infinity) {
    const funcHash = generateHash(func)
    const now = Date.now()

    // Check if the function is currently being executed
    if (pendingPromises.has(funcHash)) {
      return pendingPromises.get(funcHash) // Return the ongoing promise
    }

    // Check if the function and its arguments are cached
    if (cache.has(funcHash)) {
      const { expiry, value } = cache.get(funcHash)
      if (expiry > now) {
        return value // Return cached value if within TTL
      } else {
        cache.delete(funcHash) // Remove expired entry
      }
    }

    // Compute the function's result and cache it
    const promise = func()
    pendingPromises.set(funcHash, promise)
    try {
      const result = await promise
      cache.set(funcHash, { value: result, expiry: now + ttl })
      return result
    } finally {
      pendingPromises.delete(funcHash) // Remove the pending promise
    }
  }

  // Function to flush the entire cache
  function flushCache() {
    cache.clear()
    pendingPromises.clear()
  }

  return { memo, flushCache }
})()
