var fs = require("fs")
var loadTemplates = require("./templates")

var config = {
  dir: __dirname + "/../../templates/"
}

var mold = loadTemplates(config)

exports.buildFile = function(file) {
  var text = fs.readFileSync(file, "utf8"), result
  result = mold.bake(file, text)()
  return result
}
