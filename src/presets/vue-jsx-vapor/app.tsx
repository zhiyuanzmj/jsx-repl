import { ref } from 'vue'
import { For } from 'vue-jsx/vapor'

export default () => {
  const count = ref(1)

  return (
    <>
      <button onClick={() => count.value++}>+</button>
      <button onClick={() => count.value--}>-</button>

      <For in={count.value}>{(index) => <div>{index}</div>}</For>
    </>
  )
}
