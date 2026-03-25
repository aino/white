export function setGlobalData(data) {
  globalThis.__whiteGlobalData = data
}

export function getGlobalData() {
  return globalThis.__whiteGlobalData || {}
}

export function clearGlobalData() {
  globalThis.__whiteGlobalData = null
}
