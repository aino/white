import state from '@white/utils/state'
import { CounterContent } from './index'

export default async function counter(node) {
  const destroyers = []
  const { value, pathname } = node.dataset

  const dataState = state(
    {
      value: parseInt(value),
      pathname,
    },
    (props) => {
      node.innerHTML = CounterContent(props)
    }
  )
  destroyers.push(() => dataState.destroy())

  const onClick = (e) => {
    if (!e.target.closest('button')) return
    dataState.set((prev) => ({
      ...prev,
      value: prev.value + 1,
    }))
  }
  node.addEventListener('click', onClick)
  destroyers.push(() => node.removeEventListener('click', onClick))

  // Listen for route changes to update the displayed pathname
  const onRouteChange = (e) => {
    dataState.set((prev) => ({
      ...prev,
      pathname: e.detail.pathname,
    }))
  }
  window.addEventListener('routechange', onRouteChange)
  destroyers.push(() =>
    window.removeEventListener('routechange', onRouteChange)
  )

  return () => {
    destroyers.forEach((destroy) => destroy())
  }
}
