import {chatProsePadPlugin} from "./chat"
import {commentsProsePadPlugin} from "./comment"
import {EditorConnection} from "./connection"
import {Reporter} from "./reporter"
import {usersProsePadPlugin} from "./users"

const report = new Reporter()
const plugins = [chatProsePadPlugin, commentsProsePadPlugin, usersProsePadPlugin]

const data = document.getElementById("data")
const connection = new EditorConnection(report, plugins, document.location)
connection.startFromData(JSON.parse(data.textContent))
data.parentNode.removeChild(data)
