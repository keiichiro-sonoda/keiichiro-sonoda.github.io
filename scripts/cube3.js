async function findSolutions() {
    for (let target = 1; target <= 100; ++target) {
        await findCubeCombinationFor(target);
    }
}

async function findCubeCombinationFor(target) {
    return new Promise(resolve => {
        setTimeout(() => {
            for (let x = 0; x <= Math.cbrt(target); ++x) {
                for (let y = 0; y <= Math.cbrt(target); ++y) {
                    const z = Math.cbrt(target - x ** 3 - y ** 3);
                    if (Number.isInteger(z) && x ** 3 + y ** 3 + z ** 3 === target) {
                        addToOutput(target, x, y, z);
                        resolve();
                        return;
                    }
                }
            }
            resolve();
        }, 0);
    });
}

function addToOutput(target, x, y, z) {
    const output = document.getElementById("output");
    const listItem = document.createElement("li");
    listItem.innerText = `${target} = ${x}^3 + ${y}^3 + ${z}^3`;
    output.appendChild(listItem);
}
