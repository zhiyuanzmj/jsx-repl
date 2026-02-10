import { Menu } from 'floating-vue'
import { ofetch } from 'ofetch'
import { type Project, injectKeyProps } from '../../types'

export default defineVaporComponent(() => {
  const { store } = $inject(injectKeyProps)!

  let loading = $ref(false)
  let name = $ref()
  async function submit() {
    loading = true
    try {
      await ofetch('/api/project', {
        method: 'POST',
        body: {
          name,
          userName: store.userName,
          userId: store.user.id,
          hash: store.serialize(),
        },
      })
      store.preset = store.userName + '/' + name
      name = ''
      getProjects()
    } finally {
      loading = false
    }
  }

  let projects = $ref<Project[]>([])
  async function getProjects() {
    if (!store.userName) return
    const { data } = await ofetch('/api/project', {
      params: {
        userName: store.userName,
      },
    }).catch(() => ({ data: [] }))
    projects = data.map((i: Project) => ({
      ...i,
      originName: i.name,
    }))
  }
  getProjects()

  let publicProjects = $ref<Project[]>([])
  async function getPublicProjects() {
    const { data } = await ofetch('/api/project').catch(() => ({ data: [] }))
    publicProjects = data
  }
  getPublicProjects()

  watch(
    () => store.userName,
    () => getProjects(),
  )

  const groupFn = (acc: Record<string, Project[]>, project: Project) => {
    if (!acc[project.userName]) {
      acc[project.userName] = []
    }
    if (!acc[project.userName].some((i) => i.id === project.id)) {
      acc[project.userName].push(project)
    }
    return acc
  }
  const projectsGroup = computed(() =>
    publicProjects.reduce(groupFn, projects.reduce(groupFn, {})),
  )

  async function deleteProject(project: Project) {
    if (confirm('Confirm delete the project?')) {
      loading = true
      try {
        await ofetch(
          '/api/project/' + project.userName + '/' + project.originName,
          { method: 'DELETE' },
        )
        getProjects()
      } finally {
        loading = false
      }
    }
  }

  async function updateProject(project: Project) {
    loading = true
    try {
      await ofetch(
        '/api/project/' + project.userName + '/' + project.originName,
        {
          method: 'PUT',
          body: {
            name: project.name,
            userName: project.userName,
          },
        },
      )
      if (store.project?.id === project.id) {
        store.preset = store.userName + '/' + project.name
      }
      await getProjects()
      project.editing = false
    } finally {
      loading = false
    }
  }

  async function toggleProjectPublic(project: Project) {
    loading = true
    try {
      await ofetch('/api/project/' + project.userName + '/' + project.name, {
        method: 'PUT',
        body: {
          public: !project.public,
        },
      })
      getProjects()
    } finally {
      loading = false
    }
  }

  return (
    <div class="flex items-center gap-2">
      <Menu distance={8}>
        {{
          default: () =>
            (<button class="i-carbon:add-large bg-$text! text-xl" />) as any,
          popper: () =>
            (
              <>
                <form
                  v-if={store.user.id}
                  class="px4 py2 text-sm relative"
                  onSubmit_prevent
                >
                  <div class="text mb1 flex op70">Project Name</div>
                  <div class="flex items-center">
                    {/* TODO can't use v-model */}
                    <input
                      class="outline-none bg-$bg-soft p2 rounded b-0 w-full"
                      value={name}
                      onChange={(e) => (name = e.currentTarget.value)}
                      onKeydown_enter={submit}
                    />
                    <button
                      class="bg-$bg-soft b-0 ml3 cursor-pointer px2.5 py1.3 mr--2 rounded"
                      type="button"
                      onClick={submit}
                    >
                      <div class="i-carbon:add-large bg-$text text-xl" />
                    </button>
                  </div>

                  <div v-if={store.user.id} class="mt2">
                    <div
                      v-for={(project, index) in projects}
                      key={project.id}
                      class="flex items-center p1 op80"
                    >
                      <span class="flex items-center h6 w-46">
                        <span class="text-center w-4 mr1">{index + 1}.</span>
                        <input
                          v-if={project.editing}
                          v-model={project.name}
                          class="outline-none bg-$bg-soft p2 rounded b-0"
                          onKeydown_enter={() => updateProject(project)}
                        />
                        <span v-else>{project.name}</span>
                      </span>

                      <template v-if={project.editing}>
                        <i
                          class="ml-auto i-carbon:save cursor-pointer text-lg"
                          onClick={() => updateProject(project)}
                        />
                        <i
                          class="i-carbon:close-outline cursor-pointer text-lg ml-1 mr--2"
                          onClick={() => (project.editing = false)}
                        />
                      </template>
                      <template v-else>
                        <i
                          v-if={store.user.role === 'ADMIN'}
                          class={[
                            project.public
                              ? 'i-carbon:view'
                              : 'i-carbon:view-off',
                            'ml-auto cursor-pointer text-lg mr-1.5',
                          ]}
                          onClick={() => toggleProjectPublic(project)}
                        />
                        <i
                          class="ml-auto i-carbon:edit cursor-pointer text-lg"
                          onClick={() => (project.editing = true)}
                        />
                        <i
                          class="i-carbon:trash-can cursor-pointer text-lg ml-1 mr--2"
                          onClick={() => deleteProject(project)}
                        />
                      </template>
                    </div>
                  </div>
                  <div
                    v-if={loading}
                    class="h-full absolute bottom-0 top-0 left-0 right-0 bg op50 flex"
                  >
                    <div class="i-carbon:rotate-180 text h-6 w-6 m-auto animate-spin" />
                  </div>
                </form>
                <div v-else class="px4 py2 text-sm">
                  Please login first
                </div>
              </>
            ) as any,
        }}
      </Menu>

      <select
        key={Object.keys(projectsGroup.value).length}
        v-model={store.preset}
        class="ml-auto b-(0 r-4 $border) bg-$border h-6 my-auto rounded outline-none px-1 text"
      >
        <optgroup label="Default">
          <option v-for={(_, presetName) in store.presets} key={presetName}>
            {presetName}
          </option>
        </optgroup>
        <hr />
        <optgroup
          v-for={(list, label) in projectsGroup.value}
          key={label}
          label={label}
        >
          <option
            v-for={project in list}
            key={project.id}
            value={project.userName + '/' + project.name}
          >
            {project.name}
          </option>
        </optgroup>
      </select>
    </div>
  )
})
