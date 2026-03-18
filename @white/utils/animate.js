import { outQuad } from './easing'

/**
 * Linearly interpolates between two values.
 * @param {number} v0 - The starting value.
 * @param {number} v1 - The ending value.
 * @param {number} t - The interpolation factor (0 to 1).
 * @returns {number} The interpolated value.
 */
export const lerp = (v0, v1, t) => v0 * (1 - t) + v1 * t

/**
 * Animates a value over time using a specified easing function.
 * @param {Object} options - The animation options.
 * @param {number} [options.duration=400] - The duration of the animation in milliseconds.
 * @param {Function} [options.easing=outQuad] - The easing function to apply (default is `outQuad`).
 * @param {Function} [options.onFrame] - Callback function called on each frame with the eased progress value (0 to 1).
 * @param {Function} [options.onComplete] - Callback function called when the animation is complete.
 * @param {Function} [options.onStart] - Callback function called at the start of the animation.
 * @returns {Object} An object with a `stop` method to halt the animation.
 */
const animate = ({
  duration = 400,
  easing = outQuad,
  onFrame,
  onComplete,
  onStart,
}) => {
  let stopped = false

  const returnObject = {
    /**
     * Stops the animation.
     */
    stop: () => {
      stopped = true
    },
  }

  const then = Date.now()

  /**
   * Animation loop.
   */
  function loop() {
    if (!stopped) {
      const time = Date.now() - then

      if (time === 0 && onStart) {
        onStart()
      }

      if (time > duration) {
        if (onComplete) {
          onComplete()
        }
      } else if (onFrame) {
        onFrame(easing(time / duration))
        requestAnimationFrame(loop)
      }
    }
  }

  loop()
  return returnObject
}

export default animate
