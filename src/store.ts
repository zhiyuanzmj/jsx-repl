import type { ToRefs, UnwrapRef } from 'vue'
import { compileFile, cssRE, transformTS } from './transform'
import { addEsmPrefix, atou, useRoutePath, useRouteQuery, utoa } from './utils'
import type { Organization, OutputModes, Project, User } from './types'
import type { editor } from 'monaco-editor-core'

import { defaultPresets } from './presets'
import { ofetch } from 'ofetch'
import {
  appFile,
  indexHtmlFile,
  packageFile,
  tsMacroConfigFile,
  tsconfigFile,
  viteConfigFile,
} from './presets/index'
import type { SourceMapInput } from '@ampproject/remapping'
import type { Mapping } from '@volar/monaco/worker'

export {
  packageFile,
  tsconfigFile,
  viteConfigFile,
  tsMacroConfigFile,
  indexHtmlFile,
  appFile,
}

export const configFileNames = [
  packageFile,
  tsconfigFile,
  tsMacroConfigFile,
  viteConfigFile,
]

export async function useStore(
  {
    files = ref(Object.create(null)),
    activeFilename = useRouteQuery('main', appFile),
    activeConfigFilename = useRouteQuery('config', viteConfigFile),

    errors = ref([]),
    showOutput = useRouteQuery('show-output', false),
    outputMode = useRouteQuery('output', 'js'),
    theme = ref('dark'),
    loading = ref(true),

    locale = ref(),
    typescriptVersion = ref('latest'),
    reloadLanguageTools = ref(),

    preset = useRoutePath<string>('vue-jsx'),
    presets = ref(defaultPresets as any),
    slim = ref(false),
  }: Partial<StoreState> = {},
  serializedState?: string,
): Promise<ReplStore> {
  const user = ref({} as User)
  const organization = ref<Organization>()
  const organizations = ref<Organization[]>([])
  if (
    document.cookie.split('; ').some((i) => /^token=\S+/.test(i)) &&
    !slim.value
  ) {
    user.value = await ofetch('/api/user-info').catch(() => ({}))
    organizations.value = await ofetch(
      `https://api.github.com/users/${user.value.name}/orgs`,
    )
  }
  const userName = computed(() => organization.value?.login || user.value.name)

  const project = ref<Project>()
  async function getTemplate() {
    if (serializedState) {
      return resolveHash(serializedState)
    } else if (presets.value[preset.value]) {
      project.value = undefined
      return presets.value[preset.value]
    } else {
      project.value = await ofetch('/api/project/' + preset.value)
      if (!project.value) {
        preset.value = 'vue-jsx'
        return presets.value['vue-jsx']
      }
      return resolveHash(project.value?.hash ?? '')
    }
  }

  const dependencies = computed(() => {
    try {
      const result = JSON.parse(files.value[packageFile]?.code || '{}')
      return { ...result.dependencies, ...result.devDependencies }
    } catch (e) {
      errors.value = [`Syntax error in ${packageFile}: ${(e as Error).message}`]
      return {}
    }
  })

  const viteConfig = ref({} as ViteConfig)
  const importMap = computed<ImportMap>(() => {
    const result = { ...dependencies.value }
    for (const key in result) {
      let value = result[key]
      if (value) {
        if (/^(?:\^|~|\d)/.test(value)) {
          value = `https://esm.sh/${key}@${value}`
        } else if (value === 'latest') {
          value = `https://esm.sh/${key}`
        } else if (value.startsWith('https://pkg.pr.new/')) {
          value = value.replaceAll('pkg.pr.new', 'esm.sh/pkg.pr.new')
        } else if (!value.startsWith('http')) {
          value = location.origin + value
        }
        result[key] = value
      }
    }
    return result
  })
  async function getViteConfig(code = files.value[viteConfigFile]?.code) {
    for (const name in importMap.value) {
      code = code.replaceAll(
        new RegExp(`(?<=from\\s+['"])${name}(?=['"])`, 'g'),
        importMap.value[name] as string,
      )
    }
    try {
      viteConfig.value = await import(
        /* @vite-ignore */ 'data:text/javascript;charset=utf-8,' +
          encodeURIComponent(transformTS(addEsmPrefix(code, importMap.value)))
      ).then((i) => i.default || { plugins: [] })
    } catch (e) {
      errors.value = [`Syntax error in ${packageFile}: ${(e as Error).message}`]
      console.error(e)
      viteConfig.value = { plugins: [] }
    }
    return viteConfig.value
  }

  async function setDefaultFile() {
    await setFiles(await getTemplate())
    errors.value = []
  }
  await setDefaultFile()

  async function init() {
    watch(preset, async () => {
      loading.value = true
      await setDefaultFile()
      activeFilename.value = appFile
      history.pushState(null, '', location.pathname + location.search)
      loading.value = false
    })

    watchEffect(() => {
      compileFile(store, activeFile.value).then((errs) => (errors.value = errs))
    })

    watch(
      () => [
        files.value[tsMacroConfigFile]?.code,
        files.value[tsconfigFile]?.code,
        typescriptVersion.value,
        locale.value,
        dependencies.value,
      ],
      () => reloadLanguageTools.value?.(),
      { deep: true },
    )

    watch(
      () => files.value[viteConfigFile]?.code,
      async () => {
        await getViteConfig()
        errors.value = []
        for (const [_, file] of Object.entries(files.value)) {
          await compileFile(store, file).then((errs) =>
            errors.value.push(...errs),
          )
        }
      },
    )

    // compile rest of the files
    errors.value = []
    for (const [filename, file] of Object.entries(files.value)) {
      if (
        ![
          tsMacroConfigFile,
          viteConfigFile,
          tsconfigFile,
          packageFile,
          activeFile.value.filename,
        ].includes(filename)
      )
        await compileFile(store, file).then((errs) =>
          errors.value.push(...errs),
        )
    }

    loading.value = false
  }

  function setActive(filename: string) {
    if (configFileNames.includes(filename))
      activeConfigFilename.value = filename
    else activeFilename.value = filename
  }
  const addFile: Store['addFile'] = (fileOrFilename) => {
    let file: File
    if (typeof fileOrFilename === 'string') {
      file = new File(
        fileOrFilename,
        fileOrFilename.endsWith('.tsx')
          ? `export default () => {
  return <div></div>
}`
          : '',
      )
    } else {
      file = fileOrFilename
    }
    files.value[file.filename] = file
    if (!file.hidden) setActive(file.filename)
    updateProject()
  }
  const deleteFile: Store['deleteFile'] = (filename) => {
    if (
      !confirm(`Are you sure you want to delete ${stripSrcPrefix(filename)}?`)
    ) {
      return
    }

    if (activeFilename.value === filename) {
      activeFilename.value = appFile
    }
    delete files.value[filename]
    updateProject()
  }

  const renameFile: Store['renameFile'] = async (oldFilename, newFilename) => {
    const file = files.value[oldFilename]

    if (!file) {
      errors.value = [`Could not rename "${oldFilename}", file not found`]
      return
    }

    if (!newFilename || oldFilename === newFilename) {
      errors.value = [`Cannot rename "${oldFilename}" to "${newFilename}"`]
      return
    }

    file.filename = newFilename
    const newFiles: Record<string, File> = {}

    // Preserve iteration order for files
    for (const [name, file] of Object.entries(files.value)) {
      if (name === oldFilename) {
        newFiles[newFilename] = file
      } else {
        newFiles[name] = file
      }
    }

    files.value = newFiles

    if (activeFilename.value === oldFilename) {
      activeFilename.value = newFilename
    } else {
      await compileFile(store, file).then((errs) => (errors.value = errs))
    }
    updateProject()
  }

  const getTsConfig: Store['getTsConfig'] = () => {
    try {
      return JSON.parse(files.value[tsconfigFile].code)
    } catch {
      return {}
    }
  }

  const getTsMacroConfig: Store['getTsMacroConfig'] = async () => {
    let code = files.value[tsMacroConfigFile]?.code || ''
    for (const name in importMap.value) {
      code = code.replaceAll(
        new RegExp(`(?<=from\\s+['"])${name}(?=['"])`, 'g'),
        importMap.value[name] as string,
      )
    }
    return (
      'data:text/javascript;charset=utf-8,' +
      encodeURIComponent(transformTS(addEsmPrefix(code, importMap.value)))
    )
  }

  const serialize: ReplStore['serialize'] = () => {
    const files = getFiles()
    return '#' + utoa(JSON.stringify(files))
  }
  function resolveHash(serializedState: string) {
    if (serializedState.startsWith('#'))
      serializedState = serializedState.slice(1)
    let saved: any
    try {
      saved = JSON.parse(atou(serializedState))
    } catch (err) {
      console.error(err)
      alert('Failed to load code from URL.')
      return setDefaultFile()
    }
    return saved
  }
  function getFiles() {
    const exported: Record<string, { code: string; hidden?: boolean }> = {}
    for (const [filename, file] of Object.entries(files.value)) {
      if (!file.hidden) {
        exported[filename] = { code: file.code, hidden: file.hidden }
      }
    }
    return exported
  }
  async function setFiles(newFiles: Record<string, File>) {
    const result: Record<string, File> = Object.create(null)
    for (const [filename, file] of Object.entries(newFiles)) {
      setFile(result, filename, file.code, file.hidden)
    }
    files.value = result
    await getViteConfig()
  }

  const activeFile = computed(
    () => files.value[activeFilename.value] || files.value[appFile] || {},
  )
  const activeConfigFile = computed(
    () => files.value[activeConfigFilename.value] || defaultPresets['vue-jsx'],
  )

  const fileCaches = ref(Object.create(null))

  const editor = shallowRef()
  const outputEditor = shallowRef()

  function updateProject() {
    const paths = location.pathname.slice(1).split('/')
    const hasPermission = paths[0] === store.userName && paths[1]
    if (hasPermission) {
      history.pushState(null, '', location.pathname + location.search)
      if (store.project) {
        ofetch(
          '/api/project/' + store.project.userName + '/' + store.project.name,
          {
            method: 'PUT',
            body: {
              hash: store.serialize(),
            },
          },
        )
      }
    } else {
      history.replaceState({}, '', store.serialize())
    }
  }

  const store: ReplStore = reactive({
    editor,
    outputEditor,
    organization,
    organizations,
    userName,
    files,
    fileCaches,
    activeFile,
    activeFilename,
    activeConfigFile,
    activeConfigFilename,
    importMap,
    user,
    project,
    slim,

    errors,
    showOutput,
    outputMode,
    theme,
    loading,

    locale,
    typescriptVersion,
    dependencies,
    reloadLanguageTools,
    viteConfig,
    preset,
    presets,

    init,
    setActive,
    addFile,
    deleteFile,
    renameFile,
    getTsConfig,
    getTsMacroConfig,
    serialize,
    getFiles,
    setFiles,
    updateProject,
  })
  return store
}

export type ImportMap = Record<string, string>

export type Template = {
  [indexHtmlFile]: File
  [appFile]: File
  [viteConfigFile]: File
  [tsMacroConfigFile]: File
  [tsconfigFile]: File
  [packageFile]: File
}

export type StoreState = ToRefs<{
  files: Record<string, File>
  fileCaches: Record<string, string>
  activeFilename: string
  activeConfigFilename: string
  importMap: ImportMap

  // output
  errors: (string | Error)[]
  showOutput: boolean
  outputMode: OutputModes
  theme: 'light' | 'dark'
  loading: boolean

  // volar-related
  locale: string | undefined
  typescriptVersion: string
  /** \{ dependencyName: version \} */
  dependencies: Record<string, string>
  reloadLanguageTools?: (() => void) | undefined

  preset: string
  presets: Record<string, Template>
  slim: boolean
}>

export type ResolveId = (id: string) => string | null | undefined
type Load = (id: string) => string | null | undefined
type Transform = (
  code: string,
  id: string,
) =>
  | string
  | { code: string; map: SourceMapInput; ast?: string }
  | null
  | undefined
export type VitePlugin = {
  name?: string
  enforce?: 'pre' | 'post'
  resolveId?: ResolveId | { filter: any; handler: ResolveId }
  load?: Load | { filter: any; handler: Load }
  transformInclude?: (id: string) => boolean
  transform?: Transform | { filter: any; handler: Transform }
}
export type ViteConfig = {
  plugins: VitePlugin[]
}

export interface ReplStore extends UnwrapRef<StoreState> {
  editor?: editor.ICodeEditor
  outputEditor?: editor.ICodeEditor
  organization?: Organization
  organizations: Organization[]
  userName: string
  user: User
  project?: Project
  activeFile: File
  activeConfigFile: File
  viteConfig: ViteConfig
  init(): Promise<void>
  setActive(filename: string): void
  addFile(filename: string | File): void
  deleteFile(filename: string): void
  renameFile(oldFilename: string, newFilename: string): void
  getTsConfig(): Record<string, any>
  getTsMacroConfig(): Promise<string>
  serialize(): string
  getFiles(): Record<string, { code: string; hidden?: boolean }>
  setFiles(newFiles: Record<string, File>): Promise<void>
  updateProject(): void
}

export type Store = Pick<
  ReplStore,
  | 'editor'
  | 'outputEditor'
  | 'organization'
  | 'organizations'
  | 'userName'
  | 'user'
  | 'project'
  | 'files'
  | 'serialize'
  | 'fileCaches'
  | 'activeFile'
  | 'activeConfigFile'
  | 'errors'
  | 'showOutput'
  | 'outputMode'
  | 'locale'
  | 'typescriptVersion'
  | 'dependencies'
  | 'reloadLanguageTools'
  | 'init'
  | 'setActive'
  | 'addFile'
  | 'deleteFile'
  | 'renameFile'
  | 'getTsConfig'
  | 'viteConfig'
  | 'getTsMacroConfig'
  | 'updateProject'
  | 'preset'
  | 'presets'
  | 'importMap'
  | 'theme'
  | 'loading'
  | 'slim'
>

export type CompiledStack = {
  name: string
  code: string
  map?: SourceMapInput
  enforce?: 'pre' | 'post'
}

export class File {
  compiled = {
    js: '',
    css: '',
    ts: '',
    ast: '',
    ssr: '',
  }
  editorViewState: editor.ICodeEditorViewState | null = null

  constructor(
    public filename: string,
    public code = '',
    public hidden = false,
  ) {}

  get language() {
    if (this.filename.endsWith('.vue')) {
      return 'vue'
    }
    if (this.filename.endsWith('.html')) {
      return 'html'
    }
    if (cssRE.test(this.filename)) {
      return 'css'
    }
    if (this.filename.endsWith('.ts')) {
      return 'typescript'
    }
    return 'javascript'
  }

  tsCompiledStack: CompiledStack[] = []

  tsCompiledName: string = ''

  get tsMaps() {
    return this.tsCompiledStack.map(
      (item) => item.map,
    ) as unknown as Mapping[][]
  }

  get tsCompiledIndex() {
    const result = this.tsCompiledStack.findIndex(
      (i) => i.name === this.tsCompiledName,
    )
    return result > -1 ? result : this.tsCompiledStack.length
  }

  compiledStack: CompiledStack[] = []

  compiledName: string = ''

  get compiledIndex() {
    const result = this.compiledStack.findIndex(
      (i) => i.name === this.compiledName,
    )
    return result > -1 ? result : this.compiledStack.length
  }

  get maps() {
    return this.compiledStack
      .filter((i) => !!i.map)
      .map((item) => item.map) as SourceMapInput[]
  }

  loadedIds: string[] = []
}

export function addSrcPrefix(file: string) {
  const sep = file.startsWith('/') ? '' : '/'
  return configFileNames.includes(file) || file.startsWith('src/')
    ? file
    : `src${sep}${file}`
}

export function stripSrcPrefix(file: string) {
  return file.replace(/^src\//, '')
}

function setFile(
  files: Record<string, File>,
  filename: string,
  content: string,
  hidden = false,
) {
  const normalized = addSrcPrefix(filename)
  files[normalized] = new File(normalized, content, hidden)
}
