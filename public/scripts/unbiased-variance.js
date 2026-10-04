MathJax.Hub.Queue(() => {
    applyStyle();
});

/**
 * Wrapper elements in MathJax with custom styles.
 * For block equations, we wrap them in div with class "mjx-wrapper".
 * For inline equations without link, we wrap them in div with class "mjx-inline-wrapper".
 */
function applyStyle() {
    const mjscDisplayElements = Array.from(document.getElementsByClassName("MJXc-display"));
    let mjxChtmlElements = Array.from(document.getElementsByClassName("mjx-math"));

    mjscDisplayElements.forEach(mjscDisplayElement => {
        mjxChtmlElements = mjxChtmlElements.filter(mjxChtmlElement => !mjscDisplayElement.contains(mjxChtmlElement));
        wrapElement(mjscDisplayElement, "mjx-wrapper");
    });

    mjxChtmlElements.forEach(mjxChtmlElement => {
        if (!mjxChtmlElement.querySelector("a")) {
            wrapElement(mjxChtmlElement, "mjx-inline-wrapper");
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
