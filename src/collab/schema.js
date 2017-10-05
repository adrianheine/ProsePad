import {Schema} from "prosemirror-model"
import {schema as base} from "prosemirror-schema-basic"
import {addListNodes} from "prosemirror-schema-list"

export const schema = new Schema({
  nodes: addListNodes(base.spec.nodes, "paragraph block*", "block"),
  marks: base.spec.marks
})
