import { createVaporApp, vaporInteropPlugin } from 'vue'
import { Repl } from '../src'

import { useRoutePath } from '../src/utils'

const window = globalThis.window as any
window.process = { env: {}, cwd: () => '/' }

const App = defineVaporComponent(() => {
  const src = $useRoutePath('vue-jsx')
  window.NITRO_CLIENT_ID = import.meta.env.NITRO_CLIENT_ID
  return <Repl v-model={src} theme="dark" />
})

const app = createVaporApp(App)
window.app = app
app.use(vaporInteropPlugin).mount('#app')
