import state from './state'

export default function createContext(node) {
  const cleanups = []

  const ctx = {
    on(event, selector, handler) {
      const listener = (e) => {
        const target = e.target.closest(selector)
        if (target && node.contains(target)) handler(e, target)
      }
      node.addEventListener(event, listener)
      cleanups.push(() => node.removeEventListener(event, listener))
    },

    listen(target, event, handler, options) {
      target.addEventListener(event, handler, options)
      cleanups.push(() => target.removeEventListener(event, handler, options))
    },

    state(initial, onChange) {
      const s = state(initial, onChange)
      cleanups.push(() => s.destroy())
      return s
    },

    onCleanup(fn) {
      cleanups.push(fn)
    },
  }

  const cleanup = () =>
    cleanups.forEach((fn) => typeof fn === 'function' && fn())

  return { ctx, cleanup }
}
