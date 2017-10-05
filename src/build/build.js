import path from "path"
import fs from "fs"

var pageDir = path.resolve("pages/")
var outDir = path.resolve("public/")

import mold from "../mold"

const buildFile = function(file) {
  var text = fs.readFileSync(file, "utf8").trim()
  return mold.bake(file, text)()
}

process.argv.slice(2).forEach(function(file) {
  var result = buildFile(file)
  var outfile = outDir + path.resolve(file).slice(pageDir.length).replace(/\.\w+$/, ".html")
  fs.writeFileSync(outfile, result, "utf8")
})
