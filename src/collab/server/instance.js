import {readFileSync, writeFile} from "fs"

import {Mapping} from "prosemirror-transform"

import {schema} from "../schema"
import {Comments, Comment} from "./comments"
import {populateDefaultInstances} from "./defaultinstances"

const MAX_STEP_HISTORY = 10000

// A collaborative editing document instance.
class Instance {
  constructor(id, doc, comments) {
    this.id = id
    this.doc = doc || schema.node("doc", null, [schema.node("paragraph", null, [
      schema.text("This is a collaborative test document. Start editing to make it more interesting!")
    ])])
    this.comments = comments || new Comments
    // The version number of the document instance.
    this.version = 0
    this.steps = []
    this.lastActive = Date.now()
    this.users = []
    this.usersVersion = 0
    this.ip_to_user_id = Object.create(null)
    this.userCount = 0
    this.waiting = []
    this.chat = {messages: [], version: 0}

    this.collecting = null
  }

  stop() {
    if (this.collecting != null) clearInterval(this.collecting)
  }

  addEvents(version, steps, chat, comments, users, clientID, ip) {
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
      let id = this.ip_to_user_id[ip]
      Object.assign(this.users.find(user => user.id == id), users)
      ++this.usersVersion
    }

    if (chat) {
      this.chat.messages = this.chat.messages.concat(chat.messages)
      this.chat.version = chat.version
    }

    this.sendUpdates()
    scheduleSave()
    return {version: this.version, chat: {version: this.chat.version}, comments: {version: this.comments.version}, users: {users: users && this.users, version: this.usersVersion}}
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
            users: usersVersion < this.usersVersion ? {users: this.users, version: this.usersVersion} : null}
  }

  collectUsers() {
    this.collecting = null
    let oldConnectedUsers = 0
    this.users.forEach(user => {
      if (user.connected) ++oldConnectedUsers
      user.connected = false
    })
    for (let i = 0; i < this.waiting.length; i++)
      this._registerUser(this.waiting[i].ip)

    if (oldConnectedUsers != this.waiting.length) {
      ++this.usersVersion
      this.sendUpdates()
    }
  }

  registerUser(ip) {
    if (this._registerUser(ip)) {
      ++this.usersVersion
      this.sendUpdates()
    }
  }

  _registerUser(ip) {
    let user
    if (!(ip in this.ip_to_user_id)) {
      const colors = ["lightsalmon", "lightblue"]
      const id = this.ip_to_user_id[ip] = ++this.userCount
      user = {id, name: "Unnamed user", color: colors[id % colors.length], connected: false}
      this.users.push(user)
    } else {
      user = this.users.find(user => user.id == this.ip_to_user_id[ip])
      if (!user) {
        delete this.ip_to_user_id[ip]
        console.warn(ip + " is in ip_to_user_id, but user with id " + this.ip_to_user_id[ip] + " does not exist")
        return this.registerUser(ip)
      }
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
                new Comments(json[prop].comments.map(c => Comment.fromJSON(c))))
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
    out[prop] = {doc: instances[prop].doc.toJSON(),
                 comments: instances[prop].comments.comments}
  writeFile(saveFile, JSON.stringify(out))
}

export function getInstance(id, ip) {
  let inst = instances[id] || newInstance(id)
  if (ip) inst.registerUser(ip)
  inst.lastActive = Date.now()
  return inst
}

function newInstance(id, doc, comments) {
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
  return instances[id] = new Instance(id, doc, comments)
}

export function instanceInfo() {
  let found = []
  for (let id in instances)
    found.push({id: id, users: instances[id].users.filter(user => user.connected).length})
  return found
}
