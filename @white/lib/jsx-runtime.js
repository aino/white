import { t as _t } from '../translate.js'

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
    const ctx = globalThis.__whiteTranslation
    if (ctx?._componentStack) ctx._componentStack.push(tag.name || 'Unknown')
    const result = tag({ ...props, children: children.flat() })
    if (ctx?._componentStack) ctx._componentStack.pop()
    return result
  }

  const translateProp = props.translate
  const shouldTranslate = translateProp === true || typeof translateProp === 'string'

  let attrs = ''
  for (const [k, v] of Object.entries(props)) {
    if (k === 'translate') continue
    if (v == null || v === false) continue

    let value = v
    let key = k === 'className' ? 'class' : k

    // Special handling for style prop
    if (
      k === 'style' &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v)
    ) {
      value = styleObjectToString(v)
    }

    // Localize internal hrefs
    if (k === 'href' && typeof v === 'string' && v.startsWith('/')) {
      const ctx = globalThis.__whiteTranslation
      if (ctx && ctx.locale !== ctx.sourceLocale) {
        value = `/${ctx.locale}${v}`
      }
    }

    attrs += v === true ? ` ${key}` : ` ${key}="${value}"`
  }

  if (VOID.has(tag)) {
    return `<${tag}${attrs}>`
  }

  let content = children
    .flat()
    .map((child) => (child == null ? '' : String(child)))
    .join('')

  if (shouldTranslate) {
    const ctx = globalThis.__whiteTranslation
    content = _t(content)

    // Record untranslated with full context (for discovery)
    if (ctx?._untranslated && !ctx._lastFound && ctx.locale !== ctx.sourceLocale) {
      const component = ctx._componentStack?.at(-1) || ctx._currentComponent || '_global'
      ctx._untranslated.push({
        source: content,
        component,
        tag,
        key: typeof translateProp === 'string' ? translateProp : undefined,
      })
    }
  }

  return `<${tag}${attrs}>${content}</${tag}>`
}

export const Fragment = ({ children }) => children.flat().join('')
