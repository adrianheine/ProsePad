import crel from "crel"
import {Plugin} from "prosemirror-state"

import {usersPlugin} from "./users"

class PluginState {
  constructor({unsent = 0, version, messages}) {
    this.unsent = unsent
    this.version = version
    this.messages = messages
  }

  unsentMessages() {
    return this.unsent ? this.messages.slice(-this.unsent) : []
  }

  static init(config) {
    return new PluginState(config.chat || {
      unsent: 0,
      version: 0,
      messages: []
    })
  }
}

const getChatPlugin = ({messages, form}) => {
  let chatPlugin
  const addChatMessage = (state, dispatch, user, text) => {
    dispatch(state.tr.setMeta(chatPlugin, {type: "new", message: {date: new Date(state.tr.time).toISOString(), user, text}}))
  }

  chatPlugin = new Plugin({
    state: {
      init: PluginState.init,
      apply(tr, prev) {
        let meta = tr.getMeta(chatPlugin)
        if (meta) {
          if (meta.type === "new") {
            let message = meta.message
            return new PluginState({unsent: prev.unsent + 1, version: prev.version + 1, messages: prev.messages.concat(message)})
          } else {
            return new PluginState({version: meta.version, unsent: prev.unsent - meta.sent, messages: prev.messages.concat(meta.messages)})
          }
        } else {
          return prev
        }
      }
    },
    view(editorView) {
      let update = (editorView, oldEditorState) => {
        const editorState = editorView.state
        messages.innerHTML = ""
        chatPlugin.getState(editorState).messages.forEach(({date, user, text}) => {
          date = new Date(date)
          messages.appendChild(crel("li", {class: `author-${user}`}, [
            crel("span", {class: "author"},
            usersPlugin.getState(editorState).getUser(user).name),
            ": ",
            crel("span", text),
            " (",
            crel("time", {title: date.toString(), datetime: date.toISOString()}, `${date.getHours()}:${date.getMinutes()}`),
            ")"
          ]))
        })
      }

      form.onsubmit = e => {
        let textInput = e.target.childNodes[1]
        if (textInput.value) {
          addChatMessage(editorView.state, editorView.dispatch, usersPlugin.getState(editorView.state).curUser, textInput.value)
          textInput.value = ""
        }
        e.preventDefault()
      }
      update(editorView, editorView.state)

      return {
        update,
        destroy: () => {
        }
      }
    }
  })
  return chatPlugin
}

export const getChatProsePadPlugin = domNodes => {
  const chatPlugin = getChatPlugin(domNodes)
  return {
    key: "chat",

    proseMirrorPlugins(dispatch) {
      return [
        chatPlugin
      ]
    },

    getVersion(state) {
      return chatPlugin.getState(state).version
    },

    receive(tr, {version, messages = []}, dataSent) {
      let sent = dataSent ? dataSent.messages.length : 0
      tr.setMeta(chatPlugin, {type: "receive", version, messages, sent})
    },

    getSendable(editState) {
      let events = chatPlugin.getState(editState).unsentMessages()
      return events.length > 0 ? {messages: events, version: chatPlugin.getState(editState).version} : null
    },

    getMenuItem() {
      return null
    }
  }
}
