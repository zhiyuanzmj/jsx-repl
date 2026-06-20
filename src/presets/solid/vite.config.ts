import { transform } from '@babel/standalone'
import jsx from 'babel-preset-solid'

export default {
  plugins: [
    {
      name: 'vite-plugin-solid',
      transform(code, id) {
        if (id.match(/\.[jt]sx$/))
          return transform(code, {
            presets: [['typescript'], jsx],
            filename: id,
            sourceMaps: true,
          })
      },
    },
  ],
}
