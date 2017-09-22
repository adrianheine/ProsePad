var path = require("path")
var fs = require("fs")

var pageDir = path.resolve(__dirname + "/../../pages/")
var outDir = path.resolve(__dirname + "/../../public/")

var mold = require('../mold')

const buildFile = function(file) {
  var text = fs.readFileSync(file, "utf8").trim()
  return mold.bake(file, text)()
}

process.argv.slice(2).forEach(function(file) {
  var result = buildFile(file)
  var outfile = outDir + path.resolve(file).slice(pageDir.length).replace(/\.\w+$/, ".html")
  fs.writeFileSync(outfile, result, "utf8")
})
