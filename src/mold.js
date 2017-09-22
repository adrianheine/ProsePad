var fs = require("fs")
var Mold = require("mold-template")

var templateDir = __dirname + "/../templates/"

var mold = new Mold({})
const buildFile = function(file, name) {
  var text = fs.readFileSync(file, "utf8").trim()
  return mold.bake(name, text)
}

fs.readdirSync(templateDir).forEach(function(filename) {
  var match = /^(.*?)\.html$/.exec(filename)
  if (match)
    buildFile(templateDir + match[0], match[1])
})

module.exports = mold
