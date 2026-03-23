import { CounterContent } from './index'

export default async function counter(node, { on, listen, state }) {
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

  on('click', 'button', () => {
    dataState.set((prev) => ({
      ...prev,
      value: prev.value + 1,
    }))
  })

  listen(window, 'routechange', (e) => {
    dataState.set((prev) => ({
      ...prev,
      pathname: e.detail.pathname,
    }))
  })
}
