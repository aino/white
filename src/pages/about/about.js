// This script auto-loads for /about routes.
// The `path` export controls which URLs trigger this script.

export const path = /^\/about$/

export default function about() {
  console.log('About page loaded')

  return () => {
    console.log('About page cleanup')
  }
}
