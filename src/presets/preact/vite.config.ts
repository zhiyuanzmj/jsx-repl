import { transform } from '@babel/standalone'
import jsx from '@babel/plugin-transform-react-jsx'

export default {
  plugins: [
    {
      name: 'vite-plugin-preact',
      transform(code, id) {
        if (id.match(/\.[jt]sx$/))
          return transform(code, {
            presets: [['typescript']],
            plugins: [
              [
                jsx,
                {
                  pragma: 'h',
                  pragmaFrag: 'Fragment',
                },
              ],
            ],
            filename: id,
            sourceMaps: true,
          })
      },
    },
  ],
}
