import animate, { lerp } from './animate'
import { outQuint } from './easing'

export const smoothScroll = (() => {
  const defaultOptions = {
    node: document.body,
    to: 0,
    duration: 'natural',
    easing: outQuint,
  }

  let animation = null

  return (options) => {
    let { node, to, duration, onComplete, onFrame, easing } = {
      ...defaultOptions,
      ...options,
    }
    let start = node.scrollTop
    if (animation) {
      animation.stop()
    }
    if (duration === 'natural') {
      const distance = Math.abs(scrollY - to)
      const base = 300
      const max = 600
      duration = base + (max - base) * Math.sqrt(distance / innerHeight)
    }

    animation = animate({
      duration,
      onFrame: (n) => {
        const value = lerp(start, to, n)
        if (onFrame) {
          onFrame(value)
        }
        node.scrollTo(0, value)
      },
      easing,
      onComplete,
    })

    const stopOnWheel = () => {
      animation.stop()
      onComplete && onComplete()
      node.removeEventListener('wheel', stopOnWheel)
    }

    node.addEventListener('wheel', stopOnWheel)
  }
})()

export const onScroll = (() => {
  const defaultOptions = {
    smoothness: 7,
  }
  return (callback, options) => {
    const { smoothness } = { ...defaultOptions, ...options }
    let y = 0
    let nextY = y
    let raf = null
    let then = Date.now()

    const tick = () => {
      const now = Date.now()
      const distance = nextY - y
      if (Math.abs(distance) > 0.1) {
        y += (nextY - y) / smoothness
        callback(y, now - then)
        then = now
        raf = requestAnimationFrame(tick)
      } else {
        raf = null
      }
    }
    const onScroll = () => {
      nextY = document.body.scrollTop
      if (raf === null) {
        raf = requestAnimationFrame(tick)
      }
    }
    addEventListener('scroll', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', onScroll)
    }
  }
})()
