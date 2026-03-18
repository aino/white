import Column, { ColumnContent } from './Column'

export default function Columns({ columns, title }) {
  if (!columns) return null

  return (
    <>
      {columns.map((column) => (
        <Column
          className={column.className}
          top={column.top}
          left={column.left}
          width={column.width}
          link={column.link}
        >
          <ColumnContent
            image={column.image}
            video={column.video}
            html={column.html}
            title={title}
            width={column.width}
          />
        </Column>
      ))}
    </>
  )
}
