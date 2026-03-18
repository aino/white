import LZString from 'lz-string'

export const compress = (obj) =>
  LZString.compressToEncodedURIComponent(
    typeof obj === 'string' ? obj : JSON.stringify(obj)
  )
export const decompress = (str) =>
  JSON.parse(LZString.decompressFromEncodedURIComponent(str))
