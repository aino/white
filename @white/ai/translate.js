import { createHash } from 'crypto'

export function setTranslationContext(locale, sourceLocale, translations) {
  globalThis.__whiteTranslation = {
    locale,
    sourceLocale,
    translations: translations || {},
    _untranslated: [],
    _componentStack: [],
    _currentComponent: null,
  }
}

export function clearTranslationContext() {
  const ctx = globalThis.__whiteTranslation
  globalThis.__whiteTranslation = null
  return ctx?._untranslated || []
}

export function sourceHash(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 8)
}

export function translationId(component, tag, source, key) {
  const input = key
    ? `${component}::${key}`
    : `${component}::${tag}::${source}`
  return createHash('sha1').update(input).digest('hex').slice(0, 8)
}

// Raw fetch to Anthropic API — no SDK dependency (Lambda@Edge code size limit)
export async function translateStrings(locale, strings, config) {
  const apiKey = '__ANTHROPIC_API_KEY__'
  if (!apiKey || !apiKey.startsWith('sk-')) return null

  const model = config?.model || 'claude-haiku-4-5-20251001'
  const style = config?.style
  const keep = config?.keep

  const numbered = strings.map((s, i) => `${i + 1}. ${JSON.stringify(s)}`).join('\n')

  const [lang, region] = locale.split('-')
  const localeDesc = region ? `${locale} (language: ${lang}, region: ${region})` : locale

  let rules = `- The target locale is ${localeDesc}. The language subtag "${lang}" determines the translation language.
- If the source and target language are the same, adapt for the target region or return unchanged.
- Preserve ALL HTML tags and attributes exactly as-is (only translate text content)
- Return ONLY a JSON object mapping each English string to its translation
- Use the exact English strings as keys (including any HTML)`

  if (keep?.length) {
    rules += `\n- NEVER translate these words, keep them exactly as-is: ${keep.join(', ')}`
  }

  const systemPrompt = style || 'You are a professional website translator.'

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Translate the following UI text from English to ${locale}.\n\nRules:\n${rules}\n\nStrings to translate:\n${numbered}\n\nRespond with only the JSON object, no markdown code fences.`,
        }],
      }),
    })

    if (!res.ok) {
      console.error(`Translation API error: ${res.status}`)
      return null
    }

    const data = await res.json()
    let text = data.content[0].text.trim()
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    return JSON.parse(text)
  } catch (err) {
    console.error(`Translation failed: ${err.message}`)
    return null
  }
}
