export default function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const waitingList = () => {
  const timers = []
  return {
    timers,
    destroy: () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      timers.length = 0
    },
    wait: async (ms) => {
      return new Promise((resolve) => timers.push(setTimeout(resolve, ms)))
    },
  }
}
