declare module '*/dist/templates/registry.js' {
  const registry: Record<string, (data: any) => string>
  export default registry
}

declare module '*/dist/templates/assets.json' {
  const assets: { css: string; js: string }
  export default assets
}
