export default async function loadimage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.src = src
    if (i.complete) {
      resolve(i)
    } else {
      i.onload = () => resolve(i)
      i.onerror = () => reject(i)
    }
  })
}
