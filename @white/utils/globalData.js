export function setGlobalData(data) {
  globalThis.__whiteGlobalData = data
}

export function getGlobalData() {
  if (typeof window !== 'undefined') {
    console.warn('getGlobalData() is server-only.')
  }
  return globalThis.__whiteGlobalData || {}
}

export function clearGlobalData() {
  globalThis.__whiteGlobalData = null
}
