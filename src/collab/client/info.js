export let info = {
  name: document.querySelector("#docname"),
  users: document.querySelector("#users")
}

export function userString(n) {
  return "(" + n + " user" + (n == 1 ? "" : "s") + ")"
}
