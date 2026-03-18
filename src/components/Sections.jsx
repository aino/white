import Columns from './Columns'

export default function Sections({ data, slug, children }) {
  const sections = Array.isArray(data?.sections) ? data.sections : []

  return (
    <div class="sections" data-slug={slug}>
      {sections.map((section) => (
        <section
          class={`section ${section.className || ''}`}
          style={
            section.margin
              ? { marginTop: `calc(var(--line) * ${section.margin})` }
              : {}
          }
        >
          <Columns columns={section.columns} title={data.title} />
        </section>
      ))}
      {children}
    </div>
  )
}
