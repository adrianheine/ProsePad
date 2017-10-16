import buble from "rollup-plugin-buble"
import nodeResolve from "rollup-plugin-node-resolve"
import commonJS from "rollup-plugin-commonjs"

const bublePlugin = buble({
  exclude: "node_modules/**",
  namedFunctionExpressions: false
})
const commonJsPlugin = commonJS({
  include: 'node_modules/**',
  sourceMap: false
})

const browserPlugins = [
  bublePlugin,
  nodeResolve({
    main: true,
    browser: true
  }),
  commonJsPlugin
]

const nodePlugins = [
  nodeResolve({
    main: true
  }),
  commonJsPlugin
]

export default [
  {
    input: "src/collab/client/startpage.js",
    output: {
      file: "public/js/startpage.js",
      format: "iife"
    },
    plugins: browserPlugins
  },
  {
    input: "src/collab/client/fullpage.js",
    output: {
      file: "public/js/fullpage.js",
      format: "iife"
    },
    plugins: browserPlugins
  },
  {
    input: "src/collab/server/start.js",
    output: {
      file: "lib/server.js",
      format: "cjs"
    },
    plugins: nodePlugins,
    external: ["crypto", "events", "url", "fs", "path", "http"]
  },
  {
    input: "src/build/build.js",
    output: {
      file: "lib/build.js",
      format: "cjs"
    },
    plugins: nodePlugins,
    external: ["url", "fs", "path", "http"]
  }
]
