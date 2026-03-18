export const addTrailingSlash = (str) => (!/\/$/.test(str) ? `${str}/` : str)
export const removeTrailingSlash = (str) => str.replace(/\/$/, '')
export const capitalize = (str) => str[0].toUpperCase() + str.slice(1)
export const stripHtml = (str) =>
  str
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
