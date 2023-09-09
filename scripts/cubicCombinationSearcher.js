async function findSolutions() {
    const maxLoopCount = 10000;

    const targets = Array.from({ length: 100 }, (_, i) => i + 1);

    for (let i = 0; i <= maxLoopCount; ++i) {
        const x = (i % 2 === 0) ? i / 2 : -(i + 1) / 2;
        for (let j = 0; j <= maxLoopCount; ++j) {
            const y = (j % 2 === 0) ? j / 2 : -(j + 1) / 2;
            await new Promise(resolve => setTimeout(resolve, 0)); // To avoid blocking the UI
            for (let k = 0; k <= maxLoopCount; ++k) {
                const z = (k % 2 === 0) ? k / 2 : -(k + 1) / 2;
                const sumCubes = x ** 3 + y ** 3 + z ** 3;
                if (targets.includes(sumCubes)) {
                    addToOutput(sumCubes, x, y, z);
                    targets.splice(targets.indexOf(sumCubes), 1);
                }
            }
        }
    }
    console.log(`No solution for ${targets}`);
}

function addToOutput(target, x, y, z) {
    const output = document.getElementById("output");
    const listItem = document.createElement("li");
    listItem.innerText = `${target} = ${x}^3 + ${y}^3 + ${z}^3`;
    output.appendChild(listItem);
}
