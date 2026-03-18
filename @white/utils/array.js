export function shuffle(arr) {
  let i = arr.length
  if (i === 0) return arr
  while (--i) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = arr[i]
    const b = arr[j]
    arr[i] = b
    arr[j] = a
  }
  return arr
}

export function insertEvery(arr, item, interval) {
  const result = []
  for (let i = 0; i < arr.length; i++) {
    result.push(arr[i])
    if ((i + 1) % interval === 0 && i !== arr.length - 1) {
      result.push(item)
    }
  }
  return result
}

export function unique(arr) {
  return [...new Set(arr)]
}
