let currentOrder = 0;

function createFindSolutions() {
    let isRunning = false;
    return function () {
        if (isRunning) {
            console.log("Already running");
            return;
        }
        isRunning = true;
        _findSolutions().then(() => isRunning = false);
    }
}

async function _findSolutions() {
    let maxSum = 0;
    let triedCombinations = 0;
    let startTime = Date.now();

    const targets = Array.from({ length: 100 }, (_, i) => i + 1);

    while (targets.length > 0 && maxSum <= 10000) {
        for (let i = 0; i <= maxSum; ++i) {
            const x = (i % 2 === 0) ? i / 2 : -(i + 1) / 2;
            for (let j = i; j <= maxSum; ++j) { // j starts from i to avoid duplicates
                const y = (j % 2 === 0) ? j / 2 : -(j + 1) / 2;

                const k = maxSum - i - j;
                await new Promise(resolve => setTimeout(resolve, 0)); // To avoid blocking the UI

                const z = (k % 2 === 0) ? k / 2 : -(k + 1) / 2;
                const sumCubes = x ** 3 + y ** 3 + z ** 3;
                ++triedCombinations;

                console.log(`Trying ${x}^3 + ${y}^3 + ${z}^3 = ${sumCubes}`)

                if (targets.includes(sumCubes)) {
                    const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
                    addToOutput(sumCubes, x, y, z, elapsedTime, triedCombinations);
                    targets.splice(targets.indexOf(sumCubes), 1);
                }
            }
        }
        ++maxSum;
    }
    console.log(`No solution for ${targets}`);
}

function addToOutput(target, x, y, z, elapsedTime, triedCombinations) {
    const output = document.getElementById("output").querySelector("tbody");
    const row = output.insertRow();

    const orderCell = row.insertCell(0);
    orderCell.innerText = ++currentOrder;

    const forumlaCell = row.insertCell(1);
    forumlaCell.innerText = `${target} = ${x}^3 + ${y}^3 + ${z}^3`;

    const timeCell = row.insertCell(2);
    timeCell.innerText = elapsedTime.toFixed(2);

    const combinationCell = row.insertCell(3);
    combinationCell.innerText = triedCombinations;
}

const findSolutions = createFindSolutions();
