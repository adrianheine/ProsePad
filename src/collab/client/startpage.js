import crel from "crel"

import {commentsProsePadPlugin} from "./comment"
import {ProsePad} from "./prosepad"
import {Reporter} from "./reporter"
import {GET} from "./http"
import {getUsersProsePadPlugin, userString} from "./users"

const report = new Reporter()
let baseUrl = "/"

document.querySelector("#changedoc").addEventListener("click", e => {
  GET(baseUrl + "_docs", "application/json").then(data => showDocList(e.target, JSON.parse(data)),
                                    err => report.failure(err))
})

let docList
function showDocList(node, list) {
  if (docList) docList.parentNode.removeChild(docList)

  let ul = docList = document.body.appendChild(crel("ul", {class: "doclist"}))
  list.forEach(doc => {
    ul.appendChild(crel("li", {"data-name": doc.id},
                        doc.id + " (" + userString(doc.users))) + ")"
  })
  ul.appendChild(crel("li", {"data-new": "true", style: "border-top: 1px solid silver; margin-top: 2px"},
                      "Create a new document"))

  let rect = node.getBoundingClientRect()
  ul.style.top = (rect.bottom + 10 + pageYOffset - ul.offsetHeight) + "px"
  ul.style.left = (rect.left - 5 + pageXOffset) + "px"

  ul.addEventListener("click", e => {
    if (e.target.nodeName == "LI") {
      ul.parentNode.removeChild(ul)
      docList = null
      if (e.target.hasAttribute("data-name"))
        location = baseUrl + encodeURIComponent(e.target.getAttribute("data-name"))
      else
        newDocument()
    }
  })
}
document.addEventListener("click", () => {
  if (docList) {
    docList.parentNode.removeChild(docList)
    docList = null
  }
})

function newDocument() {
  let name = prompt("Name the new document", "")
  if (name)
    location = baseUrl + encodeURIComponent(name)
}


const plugins = [
  commentsProsePadPlugin,
  getUsersProsePadPlugin({users: document.querySelector(".user-count")})
]

document.querySelector("#docname").textContent = "Example"
const prosepad = window.prosepad = new ProsePad(report, plugins, document.getElementById("editor"))
prosepad.start(baseUrl + "Example").then(() => prosepad.view.focus())
