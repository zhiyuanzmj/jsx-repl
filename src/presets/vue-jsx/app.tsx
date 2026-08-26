import { defineComponent, ref } from 'vue'
import { For } from 'vue-jsx'

export default defineComponent(() => {
  const count = ref(1)

  return () => (
    <>
      <button onClick={() => count.value++}>+</button>
      <button onClick={() => count.value--}>-</button>

      <For in={count.value}>{(item) => <div>{item}</div>}</For>
    </>
  )
})
