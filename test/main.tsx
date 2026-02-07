import { createVaporApp, vaporInteropPlugin } from 'vue'
import { Repl } from '../src'

import 'uno.css'

const window = globalThis.window as any
window.process = { env: {}, cwd: () => '/' }

const App = defineVaporComponent(() => {
  return <Repl />
})

const app = createVaporApp(App)
window.app = app
app.use(vaporInteropPlugin).mount('#app')
