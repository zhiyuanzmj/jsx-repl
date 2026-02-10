import { createVaporApp, vaporInteropPlugin } from 'vue'
import { Repl } from '../src'

import { useRoutePath } from '../src/utils'

const window = globalThis.window as any
window.process = { env: {}, cwd: () => '/' }

const App = defineVaporComponent(() => {
  const src = $useRoutePath('vue-jsx')
  return <Repl v-model={src} />
})

const app = createVaporApp(App)
window.app = app
app.use(vaporInteropPlugin).mount('#app')
