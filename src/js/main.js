import site from './stores/site'

export async function pageTransition(oldApp, newApp) {
  oldApp.replaceWith(newApp)
  scrollTo(0, 0)
}

export default async function main() {
  const html = document.documentElement
  const destroyers = []

  const setAppearance = () => {
    html.classList.toggle('dark', site.value.appearance === 'dark')
    html.classList.toggle('light', site.value.appearance === 'light')
  }
  destroyers.push(
    site.subscribe((newValue, oldValue) => {
      if (oldValue.appearance !== newValue.appearance) {
        setAppearance()
      }
    })
  )

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const onMediaChange = (e) => {
    site.assign({ appearance: e.matches ? 'dark' : 'light' })
  }
  mediaQuery.addEventListener('change', onMediaChange)
  destroyers.push(() => mediaQuery.removeEventListener('change', onMediaChange))

  setAppearance()

  return () => {
    destroyers.forEach((destroy) => destroy())
  }
}
