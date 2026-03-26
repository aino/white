export function CounterContent({ value, pathname }) {
  return (
    <>
      <span class="counter-value">{value}</span>
      <button>Add</button>
      <p class="counter-pathname">
        Current path: <span class="pathname">{pathname}</span>
      </p>
    </>
  )
}

export default function Counter({ value, pathname }) {
  return (
    <div
      data-component="counter"
      key="counter"
      data-value={value}
      data-pathname={pathname}
    >
      <CounterContent value={value} pathname={pathname} />
      <script type="application/json">
        {JSON.stringify({ value, pathname })}
      </script>
    </div>
  )
}
