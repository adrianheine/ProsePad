import {readFileSync, writeFile} from "fs"

import {Mapping} from "prosemirror-transform"

import {schema} from "../schema"
import {Comments, Comment} from "./comments"
import {populateDefaultInstances} from "./defaultinstances"

const MAX_STEP_HISTORY = 10000

// A collaborative editing document instance.
class Instance {
  constructor(id, doc, comments, users = [], chat = []) {
    this.id = id
    this.doc = doc || schema.node("doc", null, [schema.node("paragraph", null, [
      schema.text("This is a collaborative test document. Start editing to make it more interesting!")
    ])])
    this.comments = comments || new Comments
    // The version number of the document instance.
    this.version = 0
    this.steps = []
    this.lastActive = Date.now()
    this.usersVersion = 0
    this.users = new Map(users.map(user => [user.id, user]))
    this.waiting = []
    this.chat = {messages: chat, version: chat.length}

    this.collecting = null
  }

  stop() {
    if (this.collecting != null) clearInterval(this.collecting)
  }

  addEvents(version, steps, chat, comments, users, clientID, clientId) {
    this.checkVersion(version)
    if (this.version != version) return false
    let doc = this.doc, maps = []
    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = clientID
      let result = steps[i].apply(doc)
      doc = result.doc
      maps.push(steps[i].getMap())
    }
    this.doc = doc
    this.version += steps.length
    this.steps = this.steps.concat(steps)
    if (this.steps.length > MAX_STEP_HISTORY)
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY)

    this.comments.mapThrough(new Mapping(maps))
    if (comments) for (let i = 0; i < comments.length; i++) {
      let event = comments[i]
      if (event.type == "delete")
        this.comments.deleted(event.id)
      else
        this.comments.created(event)
    }

    if (users) {
      Object.assign(this.users.get(clientId), users)
      ++this.usersVersion
    }

    if (chat) {
      this.chat.messages = this.chat.messages.concat(chat.messages)
      this.chat.version = chat.version
    }

    this.sendUpdates()
    scheduleSave()
    return {version: this.version, chat: {version: this.chat.version}, comments: {version: this.comments.version}, users: {users: users && Array.from(this.users.values()), version: this.usersVersion}}
  }

  sendUpdates() {
    while (this.waiting.length) this.waiting.pop().finish()
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      let err = new Error("Invalid version " + version)
      err.status = 400
      throw err
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version, chatVersion, commentVersion, usersVersion) {
    this.checkVersion(version)
    let startIndex = this.steps.length - (this.version - version)
    if (startIndex < 0) return false
    let commentStartIndex = this.comments.events.length - (this.comments.version - commentVersion)
    if (commentStartIndex < 0) return false

    return {steps: this.steps.slice(startIndex),
            chat: chatVersion != null ? {messages: this.chat.messages.slice(chatVersion)} : null,
            comment: this.comments.eventsAfter(commentStartIndex),
            users: usersVersion < this.usersVersion ? {users: Array.from(this.users.values()), version: this.usersVersion} : null}
  }

  collectUsers() {
    this.collecting = null
    let oldConnectedUsers = 0
    this.users.forEach(user => {
      if (user.connected) ++oldConnectedUsers
      user.connected = false
    })
    for (let i = 0; i < this.waiting.length; i++)
      this._registerUser(this.waiting[i].clientId)

    if (oldConnectedUsers != this.waiting.length) {
      ++this.usersVersion
      this.sendUpdates()
    }
  }

  registerUser(clientId) {
    if (this._registerUser(clientId)) {
      ++this.usersVersion
      this.sendUpdates()
    }
  }

  _registerUser(clientId) {
    let user = this.users.get(clientId)
    if (!user) {
      const colors = ["lightsalmon", "lightblue", "#ffc7c7", "#fff1c7",
        "#c7ffd5", "#e3c7ff", "#c7ffff", "#ffc7f1", "#8fabff", "#c78fff",
        "#ff8fe3", "#d97979",
        "#d9c179", "#a9d979", "#79d991", "#79d9d9", "#7991d9", "#a979d9",
        "#d979c1", "#d9a9a9", "#d9cda9", "#c1d9a9", "#a9d9b5", "#a9d9d9",
        "#a9b5d9", "#c1a9d9", "#d9a9cd", "#4c9c82", "#12d1ad", "#2d8e80",
        "#7485c3", "#a091c7", "#3185ab", "#6818b4", "#e6e76d", "#a42c64",
        "#f386e5", "#4ecc0c", "#c0c236", "#693224", "#b5de6a", "#9b88fd",
        "#358f9b", "#496d2f", "#e267fe", "#d23056", "#1a1a64", "#5aa335",
        "#d722bb", "#86dc6c", "#b5a714", "#955b6a", "#9f2985", "#e3ffc7",
        "#c7d5ff", "#ff8f8f", "#ffe38f", "#c7ff8f", "#8fffab", "#8fffff"]
      user = {id: clientId, name: "Unnamed user", color: colors[this.users.size % colors.length], connected: false}
      this.users.set(user.id, user)
    }
    if (!user.connected) {
      user.connected = true
      if (this.collecting == null)
        this.collecting = setTimeout(() => this.collectUsers(), 5000)
      return true
    }
    return false
  }
}

const instances = Object.create(null)
let instanceCount = 0
let maxCount = 20

let saveFile = "data/instances.json", json
if (process.argv.indexOf("--fresh") == -1) {
  try {
    json = JSON.parse(readFileSync(saveFile, "utf8"))
  } catch (e) {}
}

if (json) {
  for (let prop in json)
    newInstance(prop, schema.nodeFromJSON(json[prop].doc),
                new Comments(json[prop].comments.map(c => Comment.fromJSON(c))),
                json[prop].users, json[prop].chat)
} else {
  populateDefaultInstances(newInstance)
}

let saveTimeout = null, saveEvery = 1e4
function scheduleSave() {
  if (saveTimeout != null) return
  saveTimeout = setTimeout(doSave, saveEvery)
}
function doSave() {
  saveTimeout = null
  let out = {}
  for (var prop in instances)
    out[prop] = {
      doc: instances[prop].doc.toJSON(),
      comments: instances[prop].comments.comments,
      users: Array.from(instances[prop].users.values()),
      chat: instances[prop].chat.messages
    }
  writeFile(saveFile, JSON.stringify(out), (err) => { if (err) throw err; })
}

export function getInstance(id, clientId) {
  let inst = instances[id] || newInstance(id)
  if (clientId) inst.registerUser(clientId)
  inst.lastActive = Date.now()
  return inst
}

function newInstance(id, doc, comments, users, chat) {
  if (++instanceCount > maxCount) {
    let oldest = null
    for (let id in instances) {
      let inst = instances[id]
      if (!oldest || inst.lastActive < oldest.lastActive) oldest = inst
    }
    instances[oldest.id].stop()
    delete instances[oldest.id]
    --instanceCount
  }
  return instances[id] = new Instance(id, doc, comments, users, chat)
}

export function instanceInfo() {
  let found = []
  for (let id in instances)
    found.push({id: id, users: Array.from(instances[id].users.values()).filter(user => user.connected).length})
  return found
}
