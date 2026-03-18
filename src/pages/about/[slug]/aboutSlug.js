export const path = /^\/about\/[^/]+$/

export default function aboutSlug() {
  console.log('Dynamic slug page loaded')

  return () => {
    console.log('Dynamic slug page cleanup')
  }
}
