import {createServer} from "http"
import {handleCollabRequest} from "./server"

const port = process.env.NODE_PORT

// The collaborative editing document server.
createServer((req, resp) => {
  if (!handleCollabRequest(req, resp)) {
    resp.writeHead(404, {"Content-Type": "text/plain"})
    resp.end("Not found")
  }
}).listen(port, "127.0.0.1")

console.log("Collab demo server listening on " + port)
