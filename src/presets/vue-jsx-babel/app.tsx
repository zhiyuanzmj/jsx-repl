import { defineComponent, ref } from 'vue'

export default defineComponent(() => {
  const count = ref(1)

  return () => (
    <>
      <button onClick={() => count.value++}>+</button>
      <button onClick={() => count.value--}>-</button>

      <div>{count.value}</div>
    </>
  )
})
