const html = document.documentElement

export const mobile = () => innerWidth < 768
export const tablet = () => innerWidth < 1024
export const desktop = () => innerWidth >= 1024
export const landscape = () => innerWidth > innerHeight
export const portrait = () => innerWidth < innerHeight
export const darkmode = () => html.classList.contains('dark')
export const textmode = () => html.classList.contains('textmode')
export const pixelmode = () => html.classList.contains('pixelmode')
export const touch = () => matchMedia('(hover: none)').matches
export const safari = () =>
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
