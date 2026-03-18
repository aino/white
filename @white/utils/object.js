export const isObject = (obj) =>
  Object.prototype.toString.call(obj) === '[object Object]'

export const equals = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export const clone = (obj) => JSON.parse(JSON.stringify(obj))
