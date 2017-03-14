import {EditorConnection} from "./connection"
import {Reporter} from "./reporter"

const report = new Reporter()

const data = document.getElementById("data")
const connection = new EditorConnection(report, document.location)
connection.startFromData(JSON.parse(data.textContent))
data.parentNode.removeChild(data)
