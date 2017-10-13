import {exampleSetup, buildMenuItems} from "prosemirror-example-setup"
import {Step} from "prosemirror-transform"
import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {history} from "prosemirror-history"
import {collab, receiveTransaction, sendableSteps, getVersion} from "prosemirror-collab"

import {EditorConnection} from "./connection"
import {GET} from "./http"
import {schema} from "../schema"
import {usersPlugin} from "./users"

export class ConnectionAdapter {
  constructor(prosepad) {
    this.prosepad = prosepad
  }

  getVersionQuery() {
    const {state, plugins} = this.prosepad
    return "version=" + getVersion(state) + "&" +
      plugins.map(plugin => `${plugin.key}Version=${plugin.getVersion(state)}`).join("&")
  }

  onEvents(data) {
    const {state, plugins} = this.prosepad
    if (data.steps && (data.steps.length || plugins.some(plugin => data[plugin.key]))) {
      let tr = receiveTransaction(state, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs)
      plugins.forEach(plugin => data[plugin.key] && plugin.receive(tr, data[plugin.key]))
      this.prosepad.dispatch(tr)
    }
  }

  sendable() {
    const {state, plugins} = this.prosepad
    const steps = sendableSteps(state)
    let nonNull = steps
    let sendable = plugins.reduce((res, plugin) => {
      let v = res[plugin.key] = plugin.getSendable(state)
      nonNull = nonNull || v
      return res
    }, {
      steps: steps ? steps.steps.map(s => s.toJSON()) : [],
      clientID: steps ? steps.clientID : 0
    })
    if (nonNull) {
      sendable.version = getVersion(state)
      return sendable
    }
  }

  handlePostAnswer(data, sentData) {
    const {state, plugins} = this.prosepad
    const steps = sentData.steps.map(step => Step.fromJSON(schema, step))
    let tr = steps.length > 0
        ? receiveTransaction(state, steps, repeat(sentData.clientID, steps.length))
        : state.tr
    plugins.forEach(plugin => (data[plugin.key] || sentData[plugin.key]) && plugin.receive(tr, data[plugin.key], sentData[plugin.key]))
    this.prosepad.dispatch(tr)
  }

  onBrokenConnection(error) {
    this.prosepad.start(this.prosepad.connection.url)
  }
}

export class ProsePad {
  constructor(reporter, plugins, domNode) {
    this.plugins = plugins
    this.reporter = reporter
    this.domNode = domNode
    this.state = null
    this.view = null
    this.connection = null
  }

  // Load the document from the server and start up
  start(url) {
    return GET(url, "application/json").then(
      data => this.loadData(JSON.parse(data), url),
      err => {
        this.reporter.failure(err)
        return Promise.reject(err)
      }
    )
  }

  loadData(data, url) {
    this.connection = new EditorConnection(this.reporter, url, new ConnectionAdapter(this))
    this.newStateFrom(data)
    this.connection.refresh()
  }

  newStateFrom(data) {
    let menuContent = this.plugins.reduce((menu, plugin) => {
      let item = plugin.getMenuItem()
      if (item) menu.fullMenu[0].push(item)
      return menu
    }, buildMenuItems(schema)).fullMenu
    let config = this.plugins.reduce((config, plugin) => {
      config.plugins = config.plugins.concat(plugin.proseMirrorPlugins(
        transaction => this.dispatch(transaction)
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
    this.setState(EditorState.create(config))
  }

  dispatch(transaction) {
    this.setState(this.state.apply(transaction))
    if (!this.state) {
      return
    }
    if (this.state.doc.content.size > 40000) {
      this.connection.detach()
    } else {
      this.connection.refresh()
    }
  }

  setState(state) {
    this.state = state

    // Sync the editor with state
    if (this.state) {
      let userMark = schema.mark("user", {user: usersPlugin.getState(this.state).curUser})
      this.state = this.state.apply(this.state.tr.addStoredMark(userMark))
      if (this.view)
        this.view.updateState(this.state)
      else
        this.setView(new EditorView(this.domNode, {
          state: this.state,
          dispatchTransaction: transaction => this.dispatch(transaction)
        }))
    } else this.setView(null)
  }

  close() {
    this.connection.closeRequest()
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
