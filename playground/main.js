import { createVaporApp, vaporInteropPlugin } from 'vue'
import { Repl } from 'jsx-repl'

createVaporApp(Repl, {
  slim: true,
  modelValue: 'vue-jsx',
})
  .use(vaporInteropPlugin)
  .mount('#app')
