import {schema} from "../schema"

const $node = (type, attrs, content, marks) => schema.node(type, attrs, content, marks)
const $text = (str, marks) => schema.text(str, marks)
const em = schema.marks.em.create(), strong = schema.marks.strong.create()

export function populateDefaultInstances(newInstance) {
}
