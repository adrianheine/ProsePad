var fs = require("fs")
var Mold = require("mold-template")

module.exports = function loadTemplates(config) {
  var mold = new Mold(config.env || {})
  fs.readdirSync(config.dir).forEach(function(filename) {
    var match = /^(.*?)\.html$/.exec(filename)
    if (match)
      mold.bake(match[1], fs.readFileSync(config.dir + match[1] + ".html", "utf8").trim())
  })
  return mold
}
