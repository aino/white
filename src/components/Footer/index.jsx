import { LOCALES } from 'src/config'

const LABELS = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'en-SE': 'English (Sweden)',
  'en-FI': 'English (Finland)',
  'sv-SE': 'Svenska (Sverige)',
  'sv-FI': 'Svenska (Finland)',
  'de-DE': 'Deutsch (Deutschland)',
  'de-AT': 'Deutsch (Österreich)',
  'de-CH': 'Deutsch (Schweiz)',
  'fi-FI': 'Suomi',
}

export default function Footer({ locale, path }) {
  return (
    <footer data-component="footer">
      <p>Built with White</p>
      <nav class="locale-selector">
        {LOCALES.map((loc) => {
          if (loc === locale) {
            return <span class="locale-link current">{LABELS[loc] || loc}</span>
          }
          const isDefault = loc === LOCALES[0]
          const href = isDefault ? path || '/' : `/${loc}${path || ''}`
          return (
            <a href={href} class="locale-link" data-reload>
              {LABELS[loc] || loc}
            </a>
          )
        })}
      </nav>
    </footer>
  )
}
