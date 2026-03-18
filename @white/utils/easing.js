export const linear = (t) => {
  return t
}

export const inQuad = (t) => {
  return t * t
}

export const outQuad = (t) => {
  return t * (2 - t)
}

export const inOutQuad = (t) => {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

export const inCubic = (t) => {
  return t * t * t
}

export const outCubic = (t) => {
  return --t * t * t + 1
}

export const inOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
}

export const inQuart = (t) => {
  return t * t * t * t
}

export const outQuart = (t) => {
  return 1 - --t * t * t * t
}

export const inOutQuart = (t) => {
  return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t
}

export const inQuint = (t) => {
  return t * t * t * t * t
}

export const outQuint = (t) => {
  return 1 + --t * t * t * t * t
}

export const inOutQuint = (t) => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t
}

export const inSine = (t) => {
  return -1 * Math.cos((t / 1) * (Math.PI * 0.5)) + 1
}

export const outSine = (t) => {
  return Math.sin((t / 1) * (Math.PI * 0.5))
}

export const inOutSine = (t) => {
  return (-1 / 2) * (Math.cos(Math.PI * t) - 1)
}

export const inExpo = (t) => {
  return t == 0 ? 0 : Math.pow(2, 10 * (t - 1))
}

export const outExpo = (t) => {
  return t == 1 ? 1 : -Math.pow(2, -10 * t) + 1
}

export const inOutExpo = (t) => {
  if (t == 0) return 0
  if (t == 1) return 1
  if ((t /= 1 / 2) < 1) return (1 / 2) * Math.pow(2, 10 * (t - 1))
  return (1 / 2) * (-Math.pow(2, -10 * --t) + 2)
}

export const inCirc = (t) => {
  return -1 * (Math.sqrt(1 - t * t) - 1)
}

export const outCirc = (t) => {
  return Math.sqrt(1 - (t = t - 1) * t)
}

export const inOutCirc = (t) => {
  if ((t /= 1 / 2) < 1) return (-1 / 2) * (Math.sqrt(1 - t * t) - 1)
  return (1 / 2) * (Math.sqrt(1 - (t -= 2) * t) + 1)
}

export const inElastic = (t) => {
  var s = 1.70158
  let p = 0
  let a = 1
  if (t == 0) return 0
  if (t == 1) return 1
  if (!p) p = 0.3
  if (a < 1) {
    a = 1
    s = p / 4
  } else s = (p / (2 * Math.PI)) * Math.asin(1 / a)
  return -(
    a *
    Math.pow(2, 10 * (t -= 1)) *
    Math.sin(((t - s) * (2 * Math.PI)) / p)
  )
}

export const outElastic = (t) => {
  var s = 1.70158
  let p = 0
  let a = 1
  if (t == 0) return 0
  if (t == 1) return 1
  if (!p) p = 0.3
  if (a < 1) {
    a = 1
    s = p / 4
  } else s = (p / (2 * Math.PI)) * Math.asin(1 / a)
  return a * Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1
}

export const inOutElastic = (t) => {
  var s = 1.70158
  let p = 0
  let a = 1
  if (t == 0) return 0
  if ((t /= 1 / 2) == 2) return 1
  if (!p) p = 0.3 * 1.5
  if (a < 1) {
    a = 1
    s = p / 4
  } else s = (p / (2 * Math.PI)) * Math.asin(1 / a)
  if (t < 1)
    return (
      -0.5 *
      (a * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t - s) * (2 * Math.PI)) / p))
    )
  return (
    a *
      Math.pow(2, -10 * (t -= 1)) *
      Math.sin(((t - s) * (2 * Math.PI)) / p) *
      0.5 +
    1
  )
}

export const inBounce = (t) => {
  return 1 - outBounce(1 - t)
}

export const outBounce = (t) => {
  if ((t /= 1) < 1 / 2.75) {
    return 7.5625 * t * t
  } else if (t < 2 / 2.75) {
    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
  } else if (t < 2.5 / 2.75) {
    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
  } else {
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
  }
}

export const inOutBounce = (t) => {
  if (t < 1 / 2) return inBounce(t * 2) * 0.5
  return outBounce(t * 2 - 1) * 0.5 + 0.5
}
