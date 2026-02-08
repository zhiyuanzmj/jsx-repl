import type { Store } from '../store'
import JSZip from 'jszip'

export async function downloadProject(store: Store) {
  const zip = new JSZip()

  for (const filename in store.files) {
    const file = store.files[filename]
    if (file.hidden) continue
    let code = file.code
    if (file.filename === 'package.json') {
      const json: any = JSON.parse(code)
      if (!json.devDependencies) {
        json.devDependencies = {}
      }
      for (let dep in json.dependencies) {
        json.dependencies[dep] = json.dependencies[dep].split('?')[0]
      }
      for (let dep in json.devDependencies) {
        json.devDependencies[dep] = json.devDependencies[dep].split('?')[0]
      }
      json.devDependencies['vite'] = 'latest'

      if (!json.scripts) {
        json.scripts = {}
      }
      json.scripts.dev = 'vite dev'
      json.scripts.build = 'vite build'

      code = JSON.stringify(json, null, 2)
    } else if (file.filename === 'vite.config.ts') {
      code = code.replaceAll('/raw.js', '/vite')
    } else if (file.filename === 'ts-macro.config.ts') {
      continue
    }
    zip.file(filename.replace('src/', ''), code)
  }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }))
  a.download = `${location.pathname.split('/').at(-1) || 'jsx-project'}.zip`
  a.click()
  a.remove()
}
