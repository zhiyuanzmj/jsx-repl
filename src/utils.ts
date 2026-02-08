import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate'
// import { MagicString } from 'vue/compiler-sfc'
import MagicString from 'magic-string'

export function debounce(fn: Function, n = 100) {
  let handle: any
  return (...args: any[]) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => {
      fn(...args)
    }, n)
  }
}

export function utoa(data: string): string {
  const buffer = strToU8(data)
  const zipped = zlibSync(buffer, { level: 9 })
  const binary = strFromU8(zipped, true)
  return btoa(binary)
}

export function serialize(files: Record<string, string>): string {
  return '#' + utoa(JSON.stringify(files))
}

export function atou(base64: string): string {
  const binary = atob(base64)

  // zlib header (x78), level 9 (xDA)
  if (binary.startsWith('\x78\xDA')) {
    const buffer = strToU8(binary, true)
    const unzipped = unzlibSync(buffer)
    return strFromU8(unzipped)
  }

  // old unicode hacks for backward compatibility
  // https://base64.guru/developers/javascript/examples/unicode-strings
  return decodeURIComponent(escape(binary))
}

import type { ImportMap } from './store'

export function useRouteQuery<T extends string | boolean>(
  name: string,
  defaultValue?: T,
  reload = false,
) {
  const searchParams = new URLSearchParams(location.search)
  const data = searchParams.get(name)
  const value = ref(data || defaultValue)
  return computed({
    get() {
      return value.value === 'true'
        ? true
        : value.value === 'false'
          ? false
          : value.value
    },
    set(v) {
      const searchParams = new URLSearchParams(location.search)
      if (v === defaultValue) {
        searchParams.delete(name)
      } else {
        searchParams.set(name + '', v as string)
      }
      const url = `${location.pathname}${searchParams.size ? '?' : ''}${searchParams.toString()}`
      if (reload) location.replace(url)
      else history.replaceState({}, '', url + location.hash)
      value.value = v
    },
  }) as unknown as Ref<T>
}

export function useRoutePath<T extends string>(
  defaultValue?: T,
  reload = false,
) {
  const data = location.pathname.slice(1)
  const value = ref(location.hash || data || defaultValue)
  return computed({
    get() {
      return value.value
    },
    set(v) {
      let pathname = v === defaultValue ? '' : v
      const url = `/${pathname}${location.search}`
      if (reload) location.replace(url)
      else history.pushState({}, '', url + location.hash)
      value.value = v
    },
  }) as unknown as Ref<T>
}

const esmRE = /(?<=(?:from|import)\s+['"])(?!http|\.|\/)[^'"]+(?=['"])/g
export function addEsmPrefix(code: string, importMap: ImportMap) {
  const s = new MagicString(code)
  const matches = code.matchAll(esmRE)
  for (let match of matches) {
    const matchIndex = match.index
    const matchName = match[0]
    function transform(name: string) {
      if (!importMap[name]) return
      const queryIndex = importMap[name].indexOf('?')
      const importValue =
        queryIndex > -1 ? importMap[name].slice(0, queryIndex) : importMap[name]
      const query = queryIndex > -1 ? importMap?.[name].slice(queryIndex) : ''
      s.overwrite(matchIndex, matchIndex + name.length, importValue as string)
      if (query) {
        s.appendRight(matchIndex + matchName.length, query)
      }
    }
    if (!importMap?.[matchName]) {
      transform(
        matchName
          .split('/')
          .slice(0, matchName.startsWith('@') ? 2 : 1)
          .join('/'),
      )
    } else {
      transform(matchName)
    }
  }
  return s.toString()
}

export function useDark(defaultTheme?: 'dark' | 'light') {
  const theme = ref<'dark' | 'light'>(defaultTheme as any)
  const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)')
  if (!theme.value) {
    theme.value = darkThemeMq.matches ? 'dark' : 'light'
  }
  darkThemeMq.addEventListener('change', (e) => {
    theme.value = e.matches ? 'dark' : 'light'
  })
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          const isDark = document.documentElement.classList.contains('dark')
          if (isDark && theme.value !== 'dark') {
            theme.value = 'dark'
          } else if (!isDark && theme.value !== 'light') {
            theme.value = 'light'
          }
        }
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  }
  watch(
    theme,
    (v) => {
      if (v === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    },
    { immediate: true },
  )
  return theme
}
