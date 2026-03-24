# Feature: `translate` Attribute — AI Build-Time Translation

## Summary

Add a `translate` HTML attribute that triggers AI-powered translation at build time. The English copy in JSX is the source of truth. Translations are cached in reviewable, editable JSON lock files.

```jsx
<button translate>Contact us</button>
<!-- Finnish build output: <button>Ota yhteyttä</button> -->
```

## Motivation

- Replaces i18n string tables entirely — content stays inline in JSX
- AI sees HTML context (a `<button>` in a checkout section), not a flat string — produces better translations
- Lock file pattern gives full human control: review in PRs, override any entry, approve/lock
- Progressive: works without translations (just renders English)

## Design

### Where translation happens

In `h()` in the JSX runtime. When `h('button', { translate: true }, 'Contact us')` is called, children are already resolved to a string. `h()` does a sync lookup from pre-loaded translations, swaps the content, drops the `translate` attribute from output. No HTML post-processing needed.

If locale is the source locale (first in `LOCALES`), it's a no-op — attribute is just stripped.

### Translation context

Module-level state in a translation context module. Set before rendering a page for a given locale, cleared after. `h()` imports the lookup function.

### Lock file format

`.white/translations/{locale}.json` — one file per target locale:

```json
{
  "Contact us": {
    "value": "Ota yhteyttä",
    "status": "auto",
    "sourceHash": "a1b2c3"
  },
  "<h1>Our Story</h1><p>Founded in 2019...</p>": {
    "value": "<h1>Tarinamme</h1><p>Perustettu vuonna 2019...</p>",
    "status": "approved",
    "sourceHash": "d4e5f6"
  }
}
```

- `status: "auto"` — AI-generated, safe to overwrite on next run
- `status: "approved"` — human-edited, never overwritten
- `sourceHash` — hash of the English source text. When source changes on an approved entry, build warns but does not overwrite

### Build flow

```
npm run translate          # discover strings + call Claude API for missing
npm run build              # normal build, uses cached translations from .white/
```

`translate` is a separate step you run when translatable strings change — not on every build. The build itself is just fast sync lookups from the JSON cache.

## Files to Create/Modify

### 1. `@white/ai/translate.js` — Translation context

- `setLocale(locale, translations)` / `clearLocale()`
- `lookup(sourceText)` — returns translation or original text
- Collects untranslated strings into a Set for later generation

### 2. `@white/lib/jsx-runtime.js` — Modify `h()`

~4 lines added:
- If `translate` prop exists, consume it (don't emit to HTML)
- If active locale isn't source locale: `content = lookup(content)`

### 3. `.white/translations/{locale}.json` — Lock files

- Created by the translate script
- Committed to git, reviewed in PRs
- Editable by hand — set `status: "approved"` to lock an entry

### 4. `scripts/translate.js` — Translation generation script

- Renders all pages per target locale to discover all `translate`-marked strings
- Loads existing translation cache, diffs against discovered strings
- Calls Claude API for missing/changed strings (batched, with surrounding HTML context)
- Writes results back to `.white/translations/{locale}.json`
- Reports: new translations, changed sources on approved entries, removed strings

### 5. `@white/lib/compileTemplate.js` — Integration

- Before render: load translations for current locale, set context
- After render: clear context

### 6. ISR (Lambda) integration

- `.white/translations/` JSON files are bundled with the Lambda
- Lambda handler loads translations before rendering, same as static build
- No AI calls at request time — all translations are pre-computed

### 7. `package.json` — New script

```json
{
  "translate": "node scripts/translate.js"
}
```

## Control Mechanisms

| Scenario | What happens |
|----------|-------------|
| New string added | `translate` script generates it, `status: "auto"` |
| String edited by human | Set `status: "approved"`, locked forever |
| English source changes | `sourceHash` mismatch — re-translate if auto, warn if approved |
| Translation removed from JSX | String stays in JSON (unused), can be cleaned up |
| No translation available | Falls back to source English text |
| AI mistranslation | Edit the JSON, set approved, it's locked |

## Out of Scope (for now)

- Plural forms / ICU message format
- Per-component translation scoping (flat file is fine to start)
- Auto-running translate in CI (manual step first)
- Translation memory across projects
- Variant/dialect support within a locale

## Context: Broader AI Build-Time Vision

This is the first feature in a broader exploration of AI at build time:

| Attribute | What it does | Status |
|-----------|-------------|--------|
| `translate` | Locale-aware translation at build time | **This plan** |
| `variations="name"` | Generate N content variants for A/B testing | Backlog |
| `ai-alt` (on `<img>`) | Generate alt text from image | Backlog |
| `ai-meta` (on `<head>`) | Generate SEO meta from page content | Backlog |

All follow the same pattern: declarative HTML attributes, AI generation at build time, lock file for human control.
