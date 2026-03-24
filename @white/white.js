import scripts from 'white/scripts'
import components from 'white/components'
import { id, q } from '@white/utils/dom'
import main, { pageTransition } from 'src/js/main'
import { LOCALES } from 'src/config'

import 'src/styles/main.css'
import 'white/css'

import { removeTrailingSlash } from './utils/string'
import createContext from './utils/context'

// Load translations for current locale (client-side)
const translationsReady = (async () => {
  const locale = document.documentElement.dataset.locale
  const sourceLocale = LOCALES[0]
  if (locale && locale !== sourceLocale) {
    try {
      const res = await fetch(`/assets/translations/${locale}.json`)
      if (res.ok) {
        const data = await res.json()
        // Index array format into lookup object
        const translations = Array.isArray(data)
          ? Object.fromEntries(data.filter((e) => e.source).map((e) => [e.source, e]))
          : data
        globalThis.__whiteTranslation = { locale, sourceLocale, translations, _untranslated: new Set() }
      }
    } catch {}
  }
})()

export const cachedPages = new Map()

export const config = {
  fakeSPA: true,
}


const pathnameWithoutLocale = (pathname) => {
  const pathnameLocale = pathname.split('/').filter(Boolean)[0]
  if (pathnameLocale && LOCALES.includes(pathnameLocale)) {
    return pathname.replace(`/${pathnameLocale}`, '')
  }
  return pathname
}

const fetchHtml = async (pathname) => {
  const response = await fetch(pathname, {
    headers: {
      Accept: 'text/html',
    },
  })
  if (response.ok) {
    return await response.text()
  } else {
    throw new Error(response)
  }
}

const runScripts = (() => {
  const runners = scripts
    .map((m) => ({
      path: m.path || /.*/,
      fn: m.default,
    }))
    .sort((a, b) => {
      // Sort by path depth: fewer segments (generic) first, more segments (specific) last
      const getLength = (path) => (path.match(/\\\//g) || []).length
      return getLength(a.path.source) - getLength(b.path.source)
    })

  const destroyers = []

  return async (pathname, app) => {
    for (const destroy of destroyers) {
      typeof destroy === 'function' && destroy()
    }
    destroyers.length = 0
    const parsedPathname =
      removeTrailingSlash(pathnameWithoutLocale(pathname)) || '/'
    for (const { fn } of runners.filter((p) => p.path.test(parsedPathname))) {
      const { ctx, cleanup } = createContext(app)
      const result = await fn(app, ctx)
      if (typeof result === 'function') {
        destroyers.push(() => { cleanup(); result() })
      } else {
        destroyers.push(cleanup)
      }
    }
  }
})()

// Component mounting system
const mountedComponents = new WeakMap()

const mountComponents = async (container) => {
  const componentNodes = container.querySelectorAll('[data-component]')

  for (const node of componentNodes) {
    const componentName = node.dataset.component
    const componentScript = components[componentName]

    if (componentScript && !mountedComponents.has(node)) {
      const { ctx, cleanup } = createContext(node)
      try {
        const result = await componentScript(node, ctx)
        if (typeof result === 'function') {
          mountedComponents.set(node, () => { cleanup(); result() })
        } else {
          mountedComponents.set(node, cleanup)
        }
      } catch (error) {
        console.error(`Failed to mount component ${componentName}:`, error)
      }
    }
  }
}

const prefetchLink = (link) => {
  const pathname = removeTrailingSlash(link.pathname) || '/'
  if (!cachedPages.has(pathname) && location.pathname !== pathname) {
    fetchHtml(pathname)
      .then((html) => {
        cachedPages.set(pathname, html)
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const images = doc.querySelectorAll('img')

        images.forEach((img) => {
          const tempImg = new Image()
          for (const attr of ['src', 'srcset', 'sizes']) {
            tempImg[attr] = img.getAttribute(attr) || ''
          }
        })
      })
      .catch(() => {
        console.warn(`Could not prefetch ${link.pathname}`)
      })
  }
}

const onLinkClick = (e) => {
  if (e.metaKey || e.ctrlKey) return
  if (e.currentTarget.dataset.preventclick) {
    return
  }
  const { pathname, hostname, search, hash } = new URL(e.currentTarget.href)
  if (!history.pushState || hostname !== location.hostname) {
    return
  }
  const normalizedPath = removeTrailingSlash(pathname) || '/'
  const nextHref = `${normalizedPath}${search}${hash}`
  e.preventDefault()
  history.pushState(null, '', nextHref)
}

const onLinkHover = (e) => {
  prefetchLink(e.currentTarget)
}

export const parseLinks = () => {
  for (const link of q('a')) {
    if (link.getAttribute('rel') === 'prefetch') {
      prefetchLink(link)
    }
    if (link.href) {
      link.removeEventListener('click', onLinkClick)
      link.removeEventListener('mouseover', onLinkHover)
      link.addEventListener('click', onLinkClick)
      link.addEventListener('mouseover', onLinkHover)
    }
  }
}

let prevHref = location.href

const fakeState = async (href, trigger) => {
  if (!config.fakeSPA || href === prevHref) {
    return
  }
  const { pathname, search, hash } = new URL(href)
  let prevPathname = '',
    prevSearch = '',
    prevHash = ''

  if (prevHref) {
    try {
      ;({
        pathname: prevPathname,
        search: prevSearch,
        hash: prevHash,
      } = new URL(prevHref))
    } catch (e) {
      console.warn(e)
    }
  }
  prevHref = href
  const baseApp = id('app')

  if (removeTrailingSlash(pathname) === removeTrailingSlash(prevPathname)) {
    if (search !== prevSearch) {
      const getParams = (p) =>
        Object.fromEntries(new URLSearchParams(p || '')) || {}

      const onSearchParamsChange = new CustomEvent('searchparamschange', {
        detail: {
          params: getParams(search),
          prevParams: getParams(prevSearch),
        },
      })
      dispatchEvent(onSearchParamsChange)
    }
    if (hash !== prevHash && trigger) {
      dispatchEvent(
        new HashChangeEvent('hashchange', {
          newURL: href,
          oldURL: prevHref,
        })
      )
    }
    return
  } else {
    let html = cachedPages.get(pathname)
    if (!html) {
      try {
        html = await fetchHtml(pathname)
        cachedPages.set(pathname, html)
      } catch (response) {
        console.log('404', response)
        location.href = pathname
        return
      }
    }
    const parser = new DOMParser()
    const fragment = parser.parseFromString(html, 'text/html')
    const app = fragment.querySelector('#app')
    if (!app) {
      throw new Error('No #app container found. Did you forget to add Layout?')
    }

    // Clean up ALL mounted components that won't be transferred
    for (const componentNode of baseApp.querySelectorAll('*[data-component]')) {
      if (mountedComponents.has(componentNode)) {
        const key = componentNode.getAttribute('key')

        // If it has a key and exists in new DOM, it will be transferred
        if (key && app.querySelector(`*[key="${key}"]`)) {
          continue
        }

        // Otherwise, clean it up
        const cleanup = mountedComponents.get(componentNode)
        if (typeof cleanup === 'function') {
          cleanup()
        }
        mountedComponents.delete(componentNode)
      }
    }

    // Transfer keyed component nodes
    for (const componentNode of baseApp.querySelectorAll('*[key]')) {
      const key = componentNode.getAttribute('key')
      const newNode = app.querySelector(`*[key="${key}"]`)

      if (
        newNode &&
        newNode.nodeName === componentNode.nodeName &&
        newNode.nodeType === componentNode.nodeType
      ) {
        // Component exists in new DOM - transfer it
        newNode.replaceWith(componentNode)
      }
    }
    const head = document.head
    const selector = 'head > meta, head > title'
    const bodyClass = fragment.querySelector('body').className
    document.body.className = bodyClass
    for (const node of q(selector)) {
      node.remove()
    }
    for (const transfer of fragment.querySelectorAll(selector)) {
      head.appendChild(transfer)
    }

    if (pageTransition) {
      await pageTransition(baseApp, app)
    } else {
      baseApp.replaceWith(app)
    }

    requestAnimationFrame(() => {
      parseLinks()
      runScripts(pathname, app)
      // Mount new components after page transition
      mountComponents(app)
      const onRouteChange = new CustomEvent('routechange', {
        detail: {
          pathname: removeTrailingSlash(pathname) || '/',
          prevPathname: removeTrailingSlash(prevPathname) || '/',
        },
      })
      dispatchEvent(onRouteChange)
    })
  }
}

if (config.fakeSPA) {
  window.addEventListener('popstate', () => fakeState(location.href))
  history.pushState = new Proxy(window.history.pushState, {
    apply: (target, thisArg, argArray) => {
      const nextUrl = new URL(argArray[2], location.origin).toString()
      fakeState(nextUrl, true)
      return target.apply(thisArg, argArray)
    },
  })
}

const white = async () => {
  await translationsReady
  cachedPages.set(location.pathname, document.documentElement.outerHTML)
  const app = id('app')

  main()

  runScripts(location.pathname, app)
  // Mount components on initial page load
  mountComponents(app)
  // find components that are outside #app and call them once
  for (const [name, fn] of Object.entries(components)) {
    const query = `[data-component="${name}"]`
    if (document.querySelector(query) && !app.querySelector(query)) {
      fn(app)
    }
  }

  if (config.fakeSPA) {
    parseLinks()
  }
}

window.addEventListener('DOMContentLoaded', white)
