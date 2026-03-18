// Page scripts are auto-loaded based on the path regex.
// They run when navigating to this page and clean up when leaving.

export const path = /^\/$/

export default function home() {
  console.log('Home page loaded')

  return () => {
    console.log('Home page cleanup')
  }
}
