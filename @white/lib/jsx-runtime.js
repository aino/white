let _locale = ''
let _locales = []

export function setLocale(locale, locales) {
  const defaultLocale = locales?.[0]
  _locale = locale && locale !== defaultLocale ? `/${locale}` : ''
  _locales = locales || []
}

function _localizeHref(href) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/assets')) {
    return href
  }
  if (_locales.some(l => href.startsWith(`/${l}/`) || href === `/${l}`)) {
    return href
  }
  return href === '/' ? _locale : `${_locale}${href}`
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

// Properties that accept unitless numbers
const UNITLESS_PROPERTIES = new Set([
  'animationIterationCount',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
])

function styleObjectToString(style) {
  return Object.entries(style)
    .map(([key, value]) => {
      // Convert camelCase to kebab-case (paddingTop -> padding-top)
      const cssKey = key.replace(
        /[A-Z]/g,
        (letter) => `-${letter.toLowerCase()}`
      )

      // Handle numeric values
      let cssValue = value
      if (typeof value === 'number' && value !== 0) {
        // Add 'px' suffix for non-unitless properties
        if (!UNITLESS_PROPERTIES.has(key)) {
          cssValue = `${value}px`
        } else {
          cssValue = String(value)
        }
      } else {
        cssValue = String(value)
      }

      return `${cssKey}: ${cssValue}`
    })
    .join('; ')
}

export function h(tag, props, ...children) {
  props = props || {}

  if (typeof tag === 'function') {
    return tag({ ...props, children: children.flat() })
  }

  let attrs = ''
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue

    let value = v
    let key = k === 'className' ? 'class' : k

    // Auto-localize <a href>
    if (tag === 'a' && k === 'href' && _locale && !props['data-reload']) {
      value = _localizeHref(value)
    }

    // Special handling for style prop
    if (
      k === 'style' &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v)
    ) {
      value = styleObjectToString(v)
    }

    attrs += v === true ? ` ${key}` : ` ${key}="${value}"`
  }

  if (VOID.has(tag)) {
    return `<${tag}${attrs}>`
  }

  const content = children
    .flat()
    .map((child) => (child == null ? '' : String(child)))
    .join('')

  return `<${tag}${attrs}>${content}</${tag}>`
}

export const Fragment = ({ children }) => children.flat().join('')
