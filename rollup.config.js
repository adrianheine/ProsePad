import buble from "rollup-plugin-buble"
import nodeResolve from "rollup-plugin-node-resolve"
import commonJS from "rollup-plugin-commonjs"

const plugins = [
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

export default [
  {
    input: "src/collab/client/startpage.js",
    output: {
      file: "public/js/startpage.js",
      format: "iife"
    },
    plugins
  },
  {
    input: "src/collab/client/fullpage.js",
    output: {
      file: "public/js/fullpage.js",
      format: "iife"
    },
    plugins
  }
]
