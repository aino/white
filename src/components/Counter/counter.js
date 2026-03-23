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
    dataState.assign({ value: (prev) => prev + 1 })
  })

  listen(window, 'routechange', (e) => {
    dataState.assign({ pathname: e.detail.pathname })
  })
}
