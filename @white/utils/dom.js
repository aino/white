// Selects all elements matching a query selector.
export function q(query, parent) {
  return Array.from((parent || document).querySelectorAll(query))
}

// Gets an element by its ID.
export function id(id) {
  return document.getElementById(id)
}

// Creates a new DOM element with optional attributes and appends it to a parent.
export function create(tag, attributes, parent) {
  const element = document.createElement(tag)
  if (attributes) {
    for (const key in attributes) {
      if (key in element) {
        // If it's a property of the element, set it directly
        element[key] = attributes[key]
      } else {
        // Otherwise, set it as an attribute
        element.setAttribute(key, attributes[key])
      }
    }
  }
  if (parent) {
    parent.appendChild(element)
  }
  return element
}

// Creates a DOM element from an HTML string and appends it to a parent.
export function createFromString(html, parent) {
  const template = document.createElement('template')
  template.innerHTML = html
  const element = template.content.firstChild
  if (parent) {
    parent.appendChild(element)
  }
  return element
}

// Gets the computed style property of an element.
export function getStyle(element, property) {
  return getComputedStyle(element).getPropertyValue(property)
}

// Applies a set of inline styles to an element.
export function style(element, styles) {
  for (const key in styles) {
    element.style[key] = styles[key].toString()
  }
}

// Gets the value of a CSS variable.
export function getCssVariable(variable) {
  return parseFloat(getStyle(document.documentElement, `--${variable}`))
}

// Attaches a resize or orientation change listener to the window.
export function resize(onResize) {
  const resizeEvent = 'ontouchstart' in window ? 'orientationchange' : 'resize'
  addEventListener(resizeEvent, onResize)
  onResize()
  return () => {
    removeEventListener(resizeEvent, onResize)
  }
}

export const observe = (
  node,
  onEnter,
  onLeave,
  { rootMargin = '0px', threshold = 0, once = false } = {}
) => {
  let isIntersecting = false
  let lastY = null
  let hasEntered = false
  let hasLeft = false
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const currentY = entry.boundingClientRect.y
        let direction = null
        if (lastY !== null) {
          direction = currentY < lastY ? 'down' : 'up'
        }
        lastY = currentY
        if (entry.isIntersecting && !isIntersecting) {
          isIntersecting = true
          if (!once || !hasEntered) {
            onEnter?.(direction)
            hasEntered = true
          }
        } else if (!entry.isIntersecting && isIntersecting) {
          isIntersecting = false
          if (!once || !hasLeft) {
            onLeave?.(direction)
            hasLeft = true
          }
        }
      })
    },
    { rootMargin, threshold }
  )
  observer.observe(node)
  return () => observer.unobserve(node)
}

export function update(node, source) {
  if (!node || !source) return
  let newNode
  if (typeof source === 'string') {
    const dom = new DOMParser().parseFromString(source, 'text/html')
    newNode = dom.body.firstElementChild
  } else if (source instanceof Element) {
    newNode = source
  } else {
    throw new Error('Invalid source')
  }
  const fromNodes = Array.from(node.childNodes)
  const toNodes = Array.from(newNode.childNodes)
  for (let i = 0; i < toNodes.length; i++) {
    const toNode = toNodes[i]
    const fromNode = fromNodes[i]
    if (!fromNode) {
      node.appendChild(toNode.cloneNode(true))
    } else {
      syncNodes(fromNode, toNode)
    }
  }

  while (node.childNodes.length > toNodes.length) {
    node.removeChild(node.lastChild)
  }
}

function syncNodes(fromNode, toNode) {
  if (
    fromNode.nodeType !== toNode.nodeType ||
    fromNode.nodeName !== toNode.nodeName
  ) {
    fromNode.parentNode.replaceChild(toNode.cloneNode(true), fromNode)
  } else if (fromNode.nodeType === Node.TEXT_NODE) {
    if (fromNode.textContent !== toNode.textContent)
      fromNode.textContent = toNode.textContent
  } else {
    syncAttributes(fromNode, toNode)
    const fromChildren = Array.from(fromNode.childNodes)
    const toChildren = Array.from(toNode.childNodes)
    for (let i = 0; i < toChildren.length; i++) {
      if (fromChildren[i]) {
        syncNodes(fromChildren[i], toChildren[i])
      } else {
        fromNode.appendChild(toChildren[i].cloneNode(true))
      }
    }
    while (fromNode.childNodes.length > toChildren.length) {
      fromNode.removeChild(fromNode.lastChild)
    }
  }
}

function syncAttributes(fromNode, toNode) {
  const fromAttrs = fromNode.attributes
  const toAttrs = toNode.attributes

  for (const attr of fromAttrs) {
    if (!toNode.hasAttribute(attr.name)) fromNode.removeAttribute(attr.name)
  }

  for (const attr of toAttrs) {
    if (fromNode.getAttribute(attr.name) !== attr.value) {
      fromNode.setAttribute(attr.name, attr.value)
    }
  }
}
