async function findSolutions() {
    let maxSum = 0;

    const targets = Array.from({ length: 100 }, (_, i) => i + 1);

    while (targets.length > 0 && maxSum <= 10000) {
        for (let i = 0; i <= maxSum; ++i) {
            const x = (i % 2 === 0) ? i / 2 : -(i + 1) / 2;
            for (let j = i; j <= maxSum; ++j) { // j starts from i to avoid duplicates
                const y = (j % 2 === 0) ? j / 2 : -(j + 1) / 2;

                const k = maxSum - i - j;
                console.log(i, j, k);
                await new Promise(resolve => setTimeout(resolve, 10)); // To avoid blocking the UI

                const z = (k % 2 === 0) ? k / 2 : -(k + 1) / 2;
                const sumCubes = x ** 3 + y ** 3 + z ** 3;
                if (targets.includes(sumCubes)) {
                    addToOutput(sumCubes, x, y, z);
                    targets.splice(targets.indexOf(sumCubes), 1);
                }
            }
        }
        ++maxSum;
    }
    console.log(`No solution for ${targets}`);
}

function addToOutput(target, x, y, z) {
    const output = document.getElementById("output");
    const listItem = document.createElement("li");
    listItem.innerText = `${target} = ${x}^3 + ${y}^3 + ${z}^3`;
    output.appendChild(listItem);
}
