import {Schema} from "prosemirror-model"
import {schema as base} from "prosemirror-schema-basic"
import {addListNodes} from "prosemirror-schema-list"

const marks = base.spec.marks.addToEnd("user", {
  attrs: {user: {}},
  parseDOM: [{tag: "span", getAttrs: dom => ({user: dom.getAttribute("data-user")})}],
  toDOM(node) { return ["span", {class: "author-" + node.attrs.user, "data-user": node.attrs.user}] }
})

export const schema = new Schema({
  nodes: addListNodes(base.spec.nodes, "paragraph block*", "block"),
  marks
})
