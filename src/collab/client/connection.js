import {GET, POST} from "./http"
import Union from "tagged-union"

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err)
}

const Action = new Union(["poll", "requestDone", "recover", "send", "detach"])

export class EditorConnection {
  constructor(report, url, editor) {
    this.report = report
    this.url = url
    this.state = "ready"
    this.request = null
    this.backOff = 0
    this.editor = editor
  }

  // All state changes go through this
  dispatch(action) {
    this.state = action.match({
      poll: () => {
        this.poll()
        return "polling"
      },
      recover: error => {
        if (error.status && error.status < 500) {
          this.report.failure(error)
          return null
        } else {
          this.recover(error)
          return "recovering"
        }
      },
      send: sendable => {
        this.closeRequest()
        this.send(sendable)
        return "sending"
      },
      detach: () => {
        if (this.state != "detached") this.report.failure("Document too big. Detached.")
        return "detached"
      },
      requestDone: () => {
        this.report.success()
        this.backOff = 0
        return "ready"
      }
    })
  }

  refresh() {
    let sendable
    if ((this.state == "polling" || this.state == "ready") && (sendable = this.editor.sendable())) {
      this.dispatch(Action.send(sendable))
    } else if (this.state == "ready") {
      this.dispatch(Action.poll())
    }
  }

  detach() {
    this.dispatch(Action.detach())
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    let query = this.editor.getVersionQuery()
    this.run(GET(this.url + "/events?" + query, "application/json")).then(
      data => {
        this.editor.onEvents(data)
        if (this.state == "ready") this.dispatch(Action.poll())
      },
      err => {
        if (err.status == 410 || badVersion(err)) {
          // Too far behind. Revert to server state
          this.report.failure(err)
          this.editor.onBrokenConnection(err)
        } else if (err) {
          this.dispatch(Action.recover(err))
        }
      }
    )
  }

  // Send the given steps to the server
  send(sendData) {
    let json = JSON.stringify(sendData)
    this.run(POST(this.url + "/events", json, "application/json")).then(
      data => {
        this.editor.handlePostAnswer(data, sendData)
        if (this.state == "ready") this.dispatch(Action.poll())
      },
      err => {
        if (err.status == 409) {
          // The client's document conflicts with the server's version.
          // Poll for changes and then try again.
          this.backOff = 0
          this.dispatch(Action.poll())
        } else if (badVersion(err)) {
          this.report.failure(err)
          this.editor.onBrokenConnection(err)
        } else {
          this.dispatch(Action.recover(err))
        }
      }
    )
  }

  // Try to recover from an error
  recover(err) {
    let newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200
    if (newBackOff > 1000 && this.backOff < 1000) this.report.delay(err)
    this.backOff = newBackOff
    setTimeout(() => {
      if (this.state == "recovering") this.dispatch(Action.poll())
    }, this.backOff)
  }

  closeRequest() {
    if (this.request) {
      this.request.abort()
      this.request = null
    }
  }

  run(request) {
    return (this.request = request).then(data => {
      data = JSON.parse(data)
      this.dispatch(Action.requestDone())
      return data
    })
  }
}
