// @ts-nocheck
import vueJsxVapor from 'vue-jsx-vapor/raw.js'

export default {
  plugins: [
    vueJsxVapor({
      interop: true,
      macros: true,
      sourceMap: true,
    }),
  ],
}
