# Agent Guidelines

## Project Structure
- `src/pages/` — Page components (JSX → HTML)
- `@white/lib/` — Build system (Vite plugins)
- `@white/api/` — API handlers
- `@white/utils/` — Client utilities

## Key Documentation
- [@white/UTILS.md](@white/UTILS.md) — Client-side utility reference

## Conventions
- JSX files in src/pages become static HTML routes
- Import utilities from `@white/utils/<name>`
- Type checking via JSDoc + tsconfig (checkJs)
- No TypeScript conversion needed

## Build Commands
- `npm run dev` — Dev server
- `npm run build` — Production build to dist/
- `npm run typecheck` — Type check JS files (no output)
- `npm run lint` — ESLint
