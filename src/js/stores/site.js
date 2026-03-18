import state from '@white/utils/state'

const defaultValue = {
  appearance: window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light',
  ...(typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('site') || '{}')
    : {}),
}

const store = state(defaultValue)

store.subscribe((value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('site', JSON.stringify(value))
  }
})

export default store
