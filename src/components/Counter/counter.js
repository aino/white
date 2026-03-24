import { CounterContent } from './index'
import { t } from '@white/translate'

export default async function counter(node, { on, listen, state }) {
  const { value, pathname } = node.dataset

  const dataState = state(
    {
      value: parseInt(value),
      pathname,
    },
    (props) => {
      node.innerHTML = CounterContent(props)
      // Example: t() for client-side dynamic text
      const status =
        props.value === 0 ? t('Counter is empty') : t('Items added')
      node.querySelector('.counter-status').textContent = status
    }
  )

  on('click', 'button', () => {
    dataState.assign({ value: (prev) => prev + 1 })
  })

  listen(window, 'routechange', (e) => {
    dataState.assign({ pathname: e.detail.pathname })
  })
}
