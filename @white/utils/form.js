import { q } from './dom'

// Shared helper to navigate and set nested values
const navigateNested = (obj, keys, callback) => {
  const lastKey = keys.pop()
  const target = keys.reduce((acc, key) => (acc[key] = acc[key] || {}), obj)
  callback(target, lastKey)
}

const getNestedValue = (obj, keys) =>
  keys.reduce((acc, key) => (acc ? acc[key] : undefined), obj)

export const getFormFieldValues = (form) => {
  const data = {}

  for (const input of q('input, select, textarea', form)) {
    const names = input.name.split('.')
    if (!names[0]) continue

    const value =
      input.type === 'checkbox' ? input.checked : input.value.trim() || null

    navigateNested(data, [...names], (target, lastKey) => {
      target[lastKey] = value
    })
  }

  return data
}

export const setFormFieldValues = (form, data) => {
  for (const input of q('input, select, textarea', form)) {
    const names = input.name.split('.')
    if (!names[0]) continue

    const value = getNestedValue(data, names)
    if (value === undefined) continue

    if (input.type === 'checkbox') {
      input.checked = !!value
    } else if (input.type === 'radio') {
      input.checked = input.value === value
    } else {
      input.value = value || ''
    }
  }
}
