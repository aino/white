export function CounterContent({ value }) {
  return (
    <>
      <span class="counter-value">{value}</span>
      <button>Add</button>
    </>
  )
}

export default function Counter({ value, pathname }) {
  return (
    <div data-component="counter" key="counter" data-value={value}>
      <CounterContent value={value} />
      <script type="application/json">
        {JSON.stringify({ value, pathname })}
      </script>
    </div>
  )
}
