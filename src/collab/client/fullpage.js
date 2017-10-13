import {getChatProsePadPlugin} from "./chat"
import {commentsProsePadPlugin} from "./comment"
import {ProsePad} from "./prosepad"
import {Reporter} from "./reporter"
import {getUsersProsePadPlugin} from "./users"

const plugins = [
  getChatProsePadPlugin({
    messages: document.querySelector(".chat"),
    form: document.querySelector(".chatform")
  }),
  commentsProsePadPlugin,
  getUsersProsePadPlugin({
    users: document.getElementById("users"),
    username: document.getElementById("username")
  })
]

const data = document.getElementById("data")
const prosepad = new ProsePad(new Reporter(), plugins, document.getElementById("editor"))
prosepad.loadData(JSON.parse(data.textContent), document.location)
data.parentNode.removeChild(data)
