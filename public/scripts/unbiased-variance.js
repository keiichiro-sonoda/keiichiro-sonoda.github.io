// 数式の描画が終わってから枠を付ける（MathJax 3。2026-10 に MathJax 2 の MathJax.Hub.Queue から移した）
MathJax.startup.promise.then(() => {
    applyStyle();
});

/**
 * Wrapper elements in MathJax with custom styles.
 * For block equations, we wrap them in div with class "mjx-wrapper".
 * For inline equations without link, we wrap them in div with class "mjx-inline-wrapper".
 */
function applyStyle() {
    const containers = Array.from(document.querySelectorAll("mjx-container"));

    containers.forEach(container => {
        if (container.getAttribute("display") === "true") {
            wrapElement(container, "mjx-wrapper");
        } else if (!container.querySelector("a")) {
            wrapElement(container, "mjx-inline-wrapper");
        }
    });
}

/**
 * Wraps a DOM element within a new div element with the specified class.
 * 
 * @param {Element} element - The DOM element to be wrapped.
 * @param {string} wrapperClassName - The class name to apply to the wrapper div.
 */
function wrapElement(element, wrapperClassName) {
    const wrapper = document.createElement("div");
    wrapper.className = wrapperClassName;
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
}
