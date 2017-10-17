import {createServer} from "http"
import ProsePadServer from "./server"

const port = process.env.PORT

const server = new ProsePadServer({
  cookie_secret: "a"
})

// The collaborative editing document server.
createServer((req, resp) => {
  if (!server.handle(req, resp)) {
    resp.writeHead(404, {"Content-Type": "text/plain"})
    resp.end("Not found")
  }
}).listen(port/*, "127.0.0.1"*/)

console.log("ProsePad server listening on " + port)
