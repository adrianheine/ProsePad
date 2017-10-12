import {exampleSetup, buildMenuItems} from "prosemirror-example-setup"
import {Step} from "prosemirror-transform"
import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {history} from "prosemirror-history"
import {collab, receiveTransaction, sendableSteps, getVersion} from "prosemirror-collab"

import {schema} from "../schema"
import {GET, POST} from "./http"
import Union from "tagged-union"

function badVersion(err) {
  return err.status == 400 && /invalid version/i.test(err)
}

class State {
  constructor(edit, comm) {
    this.edit = edit
    this.comm = comm
  }
}

const Action = new Union(["loaded", "restart", "poll", "recover", "transaction"])

export class EditorConnection {
  constructor(report, plugins, url) {
    this.report = report
    this.url = url
    this.state = new State(null, "start")
    this.request = null
    this.backOff = 0
    this.view = null
    this.plugins = plugins
  }

  // All state changes go through this
  dispatch(action) {
    action.match({
      loaded: data => {
        let menuContent = this.plugins.reduce((menu, plugin) => {
          menu.fullMenu[0].push(plugin.getMenuItem())
          return menu
        }, buildMenuItems(schema)).fullMenu
        let config = this.plugins.reduce((config, plugin) => {
          config.plugins = config.plugins.concat(plugin.proseMirrorPlugins(
            transaction => this.dispatch(Action.transaction({transaction}))
          ))
          config[plugin.key] = data[plugin.key]
          return config
        }, {
          plugins: exampleSetup({schema, history: false, menuContent}).concat([
            history({preserveItems: true}),
            collab({version: data.version})
          ]),
          doc: schema.nodeFromJSON(data.doc)
        })
        let editState = EditorState.create(config)
        this.state = new State(editState, "poll")
        this.poll()
      },
      restart: () => {
        this.state = new State(null, "start")
        this.start()
      },
      poll: () => {
        this.state = new State(this.state.edit, "poll")
        this.poll()
      },
      recover: error => {
        if (error.status && error.status < 500) {
          this.report.failure(error)
          this.state = new State(null, null)
        } else {
          this.state = new State(this.state.edit, "recover")
          this.recover(error)
        }
      },
      transaction: ({transaction, requestDone}) => {
        let newEditState = this.state.edit.apply(transaction)

        if (newEditState) {
          let sendable
          if (newEditState.doc.content.size > 40000) {
            if (this.state.comm != "detached") this.report.failure("Document too big. Detached.")
            this.state = new State(newEditState, "detached")
          } else if ((this.state.comm == "poll" || requestDone) && (sendable = this.sendable(newEditState))) {
            this.closeRequest()
            this.state = new State(newEditState, "send")
            this.send(newEditState, sendable)
          } else if (requestDone) {
            this.state = new State(newEditState, "poll")
            this.poll()
          } else {
            this.state = new State(newEditState, this.state.comm)
          }
        }
      }
    })

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      if (this.view)
        this.view.updateState(this.state.edit)
      else
        this.setView(new EditorView(document.querySelector("#editor"), {
          state: this.state.edit,
          dispatchTransaction: transaction => this.dispatch(Action.transaction({transaction}))
        }))
    } else this.setView(null)
  }

  // Load the document from the server and start up
  start() {
    return this.run(GET(this.url, "application/json")).then(data => {
      data = JSON.parse(data)
      this.report.success()
      this.backOff = 0
      this.startFromData(data)
    }, err => {
      this.report.failure(err)
    })
  }

  startFromData(data) {
    this.dispatch(Action.loaded(data))
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    let query = "version=" + getVersion(this.state.edit) + "&" +
      this.plugins.map(plugin => `${plugin.key}Version=${plugin.getVersion(this.state.edit)}`).join("&")
    this.run(GET(this.url + "/events?" + query, "application/json")).then(data => {
      this.report.success()
      data = JSON.parse(data)
      this.backOff = 0
      if (data.steps && (data.steps.length || this.plugins.some(plugin => data[plugin.key]))) {
        let tr = receiveTransaction(this.state.edit, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs)
        this.plugins.forEach(plugin => data[plugin.key] && plugin.receive(tr, data[plugin.key]))
        this.dispatch(Action.transaction({transaction: tr, requestDone: true}))
      } else {
        this.poll()
      }
    }, err => {
      if (err.status == 410 || badVersion(err)) {
        // Too far behind. Revert to server state
        this.report.failure(err)
        this.dispatch(Action.restart())
      } else if (err) {
        this.dispatch(Action.recover(err))
      }
    })
  }

  sendable(editState) {
    let sendable = {steps: sendableSteps(editState)}
    let nonNull = sendable.steps
    this.plugins.forEach(plugin => {
      let v = sendable[plugin.key] = plugin.getSendable(editState)
      nonNull = nonNull || v
    })
    if (nonNull) return sendable
  }

  // Send the given steps to the server
  send(editState, data) {
    let steps = data.steps
    let dataSent = this.plugins.reduce((res, plugin) => {
      res[plugin.key] = data[plugin.key]
      return res
    }, {version: getVersion(editState),
      steps: steps ? steps.steps.map(s => s.toJSON()) : [],
      clientID: steps ? steps.clientID : 0
    })
    let json = JSON.stringify(dataSent)
    this.run(POST(this.url + "/events", json, "application/json")).then(data => {
      this.report.success()
      this.backOff = 0
      let tr = steps
          ? receiveTransaction(this.state.edit, steps.steps, repeat(steps.clientID, steps.steps.length))
          : this.state.edit.tr
      data = JSON.parse(data)
      this.plugins.forEach(plugin => (data[plugin.key] || dataSent[plugin.key]) && plugin.receive(tr, data[plugin.key], dataSent[plugin.key]))
      this.dispatch(Action.transaction({transaction: tr, requestDone: true}))
    }, err => {
      if (err.status == 409) {
        // The client's document conflicts with the server's version.
        // Poll for changes and then try again.
        this.backOff = 0
        this.dispatch(Action.poll())
      } else if (badVersion(err)) {
        this.report.failure(err)
        this.dispatch(Action.restart())
      } else {
        this.dispatch(Action.recover(err))
      }
    })
  }

  // Try to recover from an error
  recover(err) {
    let newBackOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200
    if (newBackOff > 1000 && this.backOff < 1000) this.report.delay(err)
    this.backOff = newBackOff
    setTimeout(() => {
      if (this.state.comm == "recover") this.dispatch(Action.poll())
    }, this.backOff)
  }

  closeRequest() {
    if (this.request) {
      this.request.abort()
      this.request = null
    }
  }

  run(request) {
    return this.request = request
  }

  close() {
    this.closeRequest()
    this.setView(null)
  }

  setView(view) {
    if (this.view) this.view.destroy()
    this.view = view
  }
}

function repeat(val, n) {
  let result = []
  for (let i = 0; i < n; i++) result.push(val)
  return result
}
