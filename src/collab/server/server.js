import cookieSession from "cookie-session"
import {readFile} from "fs"
import Negotiator from "negotiator"
import {Step} from "prosemirror-transform"

import mold from "../../mold"
import {Router} from "./route"
import {schema} from "../schema"
import {getInstance, instanceInfo} from "./instance"

// Object that represents an HTTP response.
class Output {
  constructor(code, body, type) {
    this.code = code
    this.body = body
    this.type = type || "text/plain"
  }

  static json(data) {
    return new Output(200, JSON.stringify(data), "application/json")
  }

  // Write the response.
  resp(resp) {
    resp.writeHead(this.code, {"Content-Type": this.type})
    resp.end(this.body)
  }
}

class LaterOutput {
  constructor(promise) {
    this.promise = promise
  }

  resp(resp) {
    this.promise.then(output => output.resp(resp))
    .catch(err => {
      const output = new Output(500, String(err))
      output.resp(resp)
    })
  }
}

// : (stream.Readable, Function)
// Invoke a callback with a stream's data.
function readStreamAsJSON(stream, callback) {
  let data = ""
  stream.on("data", chunk => data += chunk)
  stream.on("end", () => {
    let result, error
    try { result = JSON.parse(data) }
    catch (e) { error = e }
    callback(error, result)
  })
  stream.on("error", e => callback(e))
}

const extensionsToMimeType = {css: "text/css", html: "text/html", js: "application/javascript"}

const getOutputForFile = path => new LaterOutput(
  new Promise((resolve, reject) =>
    readFile("public/" + path, (err, res) => {
      if (err) {
        return reject(err)
      }
      const extension = path.match(/\.(.+)$/)
      resolve(new Output(200, res, extension && extensionsToMimeType[extension[1]] || null))
    })
  )
)

function nonNegInteger(str) {
  let num = Number(str)
  if (!isNaN(num) && Math.floor(num) == num && num >= 0) return num
  let err = new Error("Not a non-negative integer: " + str)
  err.status = 400
  throw err
}

function validInstanceId(str) {
  str = str.trim()
  if (str[0] != "_" && str != "favicon.ico" && str != "") return str
  let err = new Error("Not a valid document id: " + str)
  err.status = 400
  throw err
}

// An object to assist in waiting for a collaborative editing
// instance to publish a new version before sending the version
// event data to the client.
class Waiting {
  constructor(resp, inst, clientId, finish) {
    this.clientId = clientId
    const abort = () => {
      let found = inst.waiting.indexOf(this)
      if (found > -1) inst.waiting.splice(found, 1)
    }
    this.promise = new Promise((resolve, reject) => {
      this.finish = () => resolve(finish())
      resp.setTimeout(1000 * 60 * 5, () => {
        abort()
        resolve(Output.json({}))
      })
    })
    resp.on("close", () => abort())
  }
}

export default class ProsePadServer {
  constructor({cookie_secret}) {
    const router = this.router = new Router

    const COOKIE_NAME = "id_session"
    const getClientId = (middleware => (req, res) => new Promise((resolve, reject) => {
      middleware(req, res, err => {
        if (err) return reject(err)
        req.session.id = "id" in req.session ? req.session.id : Math.floor(Math.random() * 0xFFFFFFFF)
        resolve(req.session.id)
      })
    }))(cookieSession({
      name: COOKIE_NAME,
      secret: cookie_secret,
      maxAge: 24 * 60 * 60 * 1000,
      expires: 1000 * 60 * 5
    }))

    // : (string, Array, Function)
    // Register a server route.
    function handle(method, url, f) {
      router.add(method, url, (req, resp, ...args) => {
        function finish() {
          let output
          try {
            output = f(...args, req, resp)
          } catch (err) {
            console.log(err.stack)
            output = new Output(err.status || 500, err.toString())
          }
          if (output) output.resp(resp)
        }

        if (method == "PUT" || method == "POST")
          readStreamAsJSON(req, (err, val) => {
            if (err) new Output(500, err.toString()).resp(resp)
            else { args.unshift(val); finish() }
          })
        else
          finish()
      })
    }

    // Static resources

    handle("GET", "/", () => {
      return getOutputForFile("index.html")
    })
    handle("GET", "/favicon.ico", () => {
      return getOutputForFile("favicon.ico")
    })

    handle("GET", ["_resources", "js", null], (filename) => {
      return getOutputForFile("js/" + filename)
    })
    handle("GET", ["_resources", "css", null], (filename) => {
      return getOutputForFile("css/" + filename)
    })

    // The root endpoint outputs a list of the collaborative
    // editing document instances.
    handle("GET", ["_docs"], () => {
      return Output.json(instanceInfo())
    })

    const getViewData = (inst, clientId) => ({
      doc: inst.doc.toJSON(),
      chat: inst.chat,
      users: {curUser: clientId, users: Array.from(inst.users.values()), version: inst.usersVersion},
      version: inst.version,
      comments: inst.comments
    })

    // Output the current state of a document instance.
    handle("GET", [null], (id, req, res) => {
      id = validInstanceId(id)
      return new LaterOutput(getClientId(req, res).then(clientId => {
        let inst = getInstance(id, clientId)
        const negotiator = new Negotiator(req)
        switch (negotiator.mediaType(["text/html", "application/json"])) {
        case "application/json":
          return Output.json(getViewData(inst, clientId))
        case "text/html":
          return new Output(200, mold.dispatch("editor", {
            content: JSON.stringify(getViewData(inst, clientId)),
            docName: id
          }), "text/html")
        default:
          return new Output(406, "Not Acceptable")
        }
      }))
    })

    function outputEvents(inst, data) {
      return Output.json({version: inst.version,
                          steps: data.steps.map(s => s.toJSON()),
                          clientIDs: data.steps.map(step => step.clientID),
                          comments: data.comment.length ? {comments: data.comment, version: inst.comments.version} : null,
                          chat: data.chat && data.chat.messages.length ? {messages: data.chat.messages, version: inst.chat.version} : null,
                          users: data.users})
    }

    // An endpoint for a collaborative document instance which
    // returns all events between a given version and the server's
    // current version of the document.
    handle("GET", [null, "events"], (id, req, resp) => {
      let version = nonNegInteger(req.query.version)
      let chatVersion = "chatVersion" in req.query ? nonNegInteger(req.query.chatVersion) : null
      let commentVersion = nonNegInteger(req.query.commentsVersion)
      let usersVersion = nonNegInteger(req.query.usersVersion)
      id = validInstanceId(id)

      return new LaterOutput(getClientId(req, resp).then(clientId => {
        let inst = getInstance(id, clientId)
        let data = inst.getEvents(version, chatVersion, commentVersion, usersVersion)
        if (data === false)
          return new Output(410, "History no longer available")
        // If the server version is greater than the given version,
        // return the data immediately.
        if (data.steps.length || data.comment.length || (data.chat && data.chat.messages.length))
          return outputEvents(inst, data)
        // If the server version matches the given version,
        // wait until a new version is published to return the event data.
        let wait = new Waiting(resp, inst, clientId, () => {
          return outputEvents(inst, inst.getEvents(version, chatVersion, commentVersion, usersVersion))
        })
        inst.waiting.push(wait)
        return wait.promise
      }))
    })

    // The event submission endpoint, which a client sends an event to.
    handle("POST", [null, "events"], (data, id, req, resp) => {
      let version = nonNegInteger(data.version)
      let steps = data.steps.map(s => Step.fromJSON(schema, s))
      return new LaterOutput(getClientId(req, resp).then(clientId => {
        let result = getInstance(id, clientId).addEvents(version, steps, data.chat, data.comments, data.users, data.clientID, clientId)
        if (!result)
          return new Output(409, "Version not current")
        else
          return Output.json(result)
      }))
    })
  }

  handle(req, resp) {
    return this.router.resolve(req, resp)
  }
}
