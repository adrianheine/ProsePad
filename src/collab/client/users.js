import {Plugin} from "prosemirror-state"

class PluginState {
  constructor({version, curUser, users, changed = {}}) {
    this.version = version
    this.curUser = curUser
    this.users = users
    this.changed = changed
  }

  static init(config) {
    return new PluginState(config.users || {
      version: 0,
      curUser: "1",
      users: [ {id: "1", name: "Unnamed user", color: "lightsalmon", connected: true} ]
    })
  }

  getUser(id) {
    return this.users.find(user => user.id == id)
  }

  updateCurUser(changed) {
    return new PluginState({version: this.version + 1, curUser: this.curUser, users: this.users, changed})
  }

  getUpdates() {
    return this.changed
  }

  apply(action) {
    let newState
    if (action.type == "receive") {
      let {users, version} = action
      newState = users ? new PluginState({version, curUser: this.curUser, users}) : this
      if (this.changed.name) {
        let curUser = newState.getUser(this.curUser)
        if (curUser.name != this.changed.name) throw new Error("Update not applied")
      }
    } else {
      newState = this.updateCurUser({name: action.name})
    }
    return newState
  }
}

export const userString = n => `${n} user${(n == 1 ? "" : "s")}`

export const usersPlugin = new Plugin({
  state: {
    init: PluginState.init,
    apply(tr, prev) {
      let users = tr.getMeta(usersPlugin)
      if (users) {
        return prev.apply(users)
      } else {
        return prev
      }
    }
  },

  view(editorView) {
    let styleElement = document.createElement("style")
    document.head.appendChild(styleElement)

    let update = view => {
      const usersState = usersPlugin.getState(view.state)
      styleElement.innerHTML = usersState.users.map(user => `.author-${user.id} { background-color: ${user.color} }`).join("\n")
    }

    update(editorView)

    return {
      update,
      destroy: () => {
        styleElement.parentNode.removeChild(styleElement)
      }
    }
  }
})

export const getUsersUiPlugin = ({users, username}) => new Plugin({
  view(editorView) {
    let update = view => {
      const usersState = usersPlugin.getState(view.state)
      users.textContent = userString(usersState.users.filter(user => user.connected).length)
      if (username) username.value = usersState.getUser(usersState.curUser).name
    }

    if (username) username.onchange = e => { // FIXME: also debounced onkeyup
      editorView.dispatch(editorView.state.tr.setMeta(usersPlugin, {type: "update", name: username.value}))
    }

    update(editorView)

    return {
      update,
      destroy: () => {
      }
    }
  }
})

export const getUsersProsePadPlugin = (domNodes = null) => ({
  key: "users",

  proseMirrorPlugins(dispatch) {
    return domNodes ? [
      usersPlugin,
      getUsersUiPlugin(domNodes)
    ] : [ usersPlugin ]
  },

  getVersion(state) {
    return usersPlugin.getState(state).version
  },

  receive(tr, {users, version}) {
    tr.setMeta(usersPlugin, {type: "receive", users, version})
  },

  getSendable(editState) {
    let updates = usersPlugin.getState(editState).getUpdates()
    return updates.name ? updates : null
  },

  getMenuItem() {
    return null
  }
})
