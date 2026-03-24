import { getPageContext } from './getPageContext.js'
import templates from '../dist/templates/registry.js'
import { globalData, routes } from '../src/data.config.js'
import { LOCALES } from '../src/config.js'

export async function handler(url) {
  const context = await getPageContext(url, {
    routes,
    globalData,
    locales: LOCALES,
  })

  if (!context) return null

  const Template = templates[context.key]
  if (!Template) return null

  return '<!DOCTYPE html>' + Template(context.data)
}
