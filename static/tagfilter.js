// @ts-check

addEventListener("keypress", e => {
    switch (e.key) {
    case "a":
        document.getElementById("prev")?.click()
        break
    case "d":
        document.getElementById("next")?.click()
        break
    default:
        console.log(e.key)
        break
    }
})
const tagsFilter = document.getElementById("tags-filter")
tagsFilter.classList.remove("hidden")
const style = document.createElement("style")
document.body.appendChild(style)
let first = true
function changeFilter() {
    /** @type {HTMLInputElement[]} */
    const tags = Array.from(tagsFilter.querySelectorAll("input:checked"))
    const filter = tags.map(e => `[data-normalized-tags*=" ${e.value} "]`).join(",")
    style.innerHTML = filter.length ? `.video:not(${filter}){display:none}` : ""
    tagsFilter.dataset.hasFilter = filter.length > 0 ? "yes" : undefined
    if (first) {
        first = false
    } else {
        localStorage.setItem("otoran:tags-filter", tags.map(e => e.value).join(" "))
    }
}
/** @type {Set<string>} */
const tags = new Set((localStorage.getItem("otoran:tags-filter") ?? "").split(" "))
for (const checkbox of tagsFilter.querySelectorAll("input")) {
    checkbox.checked = tags.has(checkbox.value)
}
changeFilter()
tagsFilter.addEventListener("change", changeFilter)
