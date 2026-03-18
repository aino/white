const FALLBACK_ERROR = 'Fetch Error'

class FetchError extends Error {
  constructor(json) {
    super(typeof json.error === 'string' ? json.error : FALLBACK_ERROR)
    for (const [key, value] of Object.entries(json)) {
      this[key] = value
    }
  }
}

export default async function handleFetchResponse(response) {
  const text = await response.text()
  if (!response.ok) {
    try {
      const json = JSON.parse(text)
      return Promise.reject(new FetchError(json))
    } catch {
      throw new Error(text || response.statusText || FALLBACK_ERROR)
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
