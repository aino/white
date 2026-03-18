import { clone, isObject, equals } from './object'

export default function state(value, onChange) {
  const callbacks = new Set(onChange ? [onChange] : [])

  const state = {
    value,

    subscribe(callback) {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    },

    set(newValue) {
      const oldValue = clone(this.value)
      this.value =
        typeof newValue === 'function' ? newValue(oldValue) : newValue
      if (!equals(this.value, oldValue)) {
        for (const callback of callbacks) {
          callback(this.value, oldValue)
        }
      }
    },

    assign(newValue) {
      if (!isObject(newValue) || !isObject(this.value)) {
        console.warn('assign only works with objects')
        return
      }
      state.set((prev) => ({ ...prev, ...newValue }))
    },

    destroy() {
      callbacks.clear()
    },
  }

  for (const fn of ['push', 'splice', 'pop', 'shift', 'unshift']) {
    state[fn] = (...args) => {
      if (!Array.isArray(state.value)) {
        console.warn(`${fn} only works with arrays`)
        return
      }
      const newValue = [...state.value]
      newValue[fn](...args)
      state.set(newValue)
    }
  }

  return state
}
