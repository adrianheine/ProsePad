import fs from "fs"
import Mold from "mold-template"

var templateDir = __dirname + "/../templates/"

const mold = new Mold({})
const buildFile = function(file, name) {
  var text = fs.readFileSync(file, "utf8").trim()
  return mold.bake(name, text)
}

fs.readdirSync(templateDir).forEach(function(filename) {
  var match = /^(.*?)\.html$/.exec(filename)
  if (match)
    buildFile(templateDir + match[0], match[1])
})

export default mold
