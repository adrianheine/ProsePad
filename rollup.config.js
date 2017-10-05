import buble from "rollup-plugin-buble"
import nodeResolve from "rollup-plugin-node-resolve"
import commonJS from "rollup-plugin-commonjs"

export default {
  input: "pages/script.js",
  output: {
    file: "public/js/script.js",
    format: "iife"
  },
  plugins: [
    buble({
      exclude: "node_modules/**",
      namedFunctionExpressions: false
    }),

    nodeResolve({
      main: true,
      browser: true
    }),

    commonJS({
// FIXME: Do this once all the code is moved to import
//      include: 'node_modules/**',
      sourceMap: false
    })
  ]
}

