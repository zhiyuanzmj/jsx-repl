import { ofetch } from 'ofetch'
import { Menu } from 'floating-vue'
import { type User, injectKeyProps } from '../../types'

export default defineVaporComponent(() => {
  const { store } = $inject(injectKeyProps)!

  function login() {
    location.href = `https://github.com/login/oauth/authorize?client_id=${import.meta.env.NITRO_CLIENT_ID}&redirect_uri=${location.origin}/api/oauth/redirect`
  }

  function logout() {
    ofetch('/api/logout')
    store.user = {} as User
  }

  return (
    <>
      <Menu
        v-if={store.user.name}
        cursor-pointer
        flex
        items-center
        distance={6}
        placement="bottom-end"
      >
        {{
          default: () =>
            (
              <img
                class="h6 w6 rounded-full"
                src={store.organization?.avatar_url || store.user.avatar}
              />
            ) as any,
          popper: () =>
            (
              <div class="flex-(~ col) min-w-40">
                <div class="b-(0 b-1 solid gray5) px5 py2 flex flex-col items-center">
                  <img
                    class="h12 w12 rounded-full mb2"
                    src={store.user.avatar}
                  />

                  <div class="max-h-78 mx--5 overflow-x-hidden overflow-y-auto">
                    <div
                      class="flex items-center px4 py2 w-full cursor-pointer op80 text-left hover:bg-$bg-soft"
                      onClick={() => (store.organization = undefined)}
                    >
                      <span
                        class={[
                          store.userName === store.user.name || 'op0',
                          'i-carbon:checkmark',
                          'text-xl',
                          'mr2',
                        ]}
                      />
                      <img class="h5 w5 mr2" src={store.user.avatar} />
                      <span class="flex-1">{store.user.name}</span>
                    </div>
                    <div
                      v-for={org in store.organizations}
                      key={org.id}
                      class="flex items-center px4 py2 w-full cursor-pointer op80 text-center hover:bg-$bg-soft"
                      onClick={() => (store.organization = org)}
                    >
                      <span
                        class={[
                          store.userName === org.login || 'op0',
                          'i-carbon:checkmark text-xl mr2',
                        ]}
                      />
                      <img class="h5 w5 mr2" src={org.avatar_url} />
                      {org.login}
                    </div>
                  </div>
                </div>

                <div
                  class="px4 py2 cursor-pointer text-(sm center) hover:bg-$bg-soft"
                  onClick={logout}
                >
                  Log out
                </div>
              </div>
            ) as any,
        }}
      </Menu>
      <button v-else class="text! bg!" onClick={login}>
        Log in
      </button>
    </>
  )
})
