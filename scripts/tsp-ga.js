class Points {
    constructor(nodeNum, points) {
        if (points) {
            this.points = points;
        } else {
            this.points = [];
            // 座標をランダムに生成
            for (let i = 0; i < nodeNum; i++) {
                this.points.push({
                    x: Math.random(),
                    y: Math.random()
                });
            }
        }
    }

    getPoint(index) {
        return this.points[index];
    }

    getLength() {
        return this.points.length;
    }
}

class DistanceMatrix {
    constructor(points) {
        this.matrix = [];
        for (let i = 0; i < points.getLength(); i++) {
            let row = [];
            for (let j = 0; j < points.getLength(); j++) {
                row.push(calculateDistance(points.getPoint(i), points.getPoint(j)));
            }
            this.matrix.push(row);
        }
    }

    getDistance(i, j) {
        return this.matrix[i][j];
    }
}

// Individual class
class Individual {
    constructor(points, route) {
        if (route) {
            this.route = route;
        } else {
            this.route = [...Array(points.getLength()).keys()];
            this.shuffle();
        }
    }

    // コピーメソッド
    copy() {
        // ルートのコピーを作成して新しいIndividualインスタンスを返す
        return new Individual(null, [...this.route]);
    }

    shuffle() {
        for (let i = this.route.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.route[i], this.route[j]] = [this.route[j], this.route[i]];
        }
    }

    getRoute() {
        return this.route;
    }

    setRoute(route) {
        this.route = route;
    }

    getGene(index) {
        return this.route[index];
    }

    setGene(index, value) {
        this.route[index] = value;
    }
}

class Population {
    /**
     * Populationクラスのコンストラクタ
     * @param {Points} points - 座標の集合
     * @param {number} size - Populationのサイズ（個体数）
     */
    constructor(points, size) {
        this.points = points;
        this.individuals = [];
        for (let i = 0; i < size; i++) {
            this.individuals.push(new Individual(points));
        }
    }

    /**
     * 指定したインデックスの個体を取得する
     * @param {number} index - 取得したい個体のインデックス
     * @returns {Individual} - 指定したインデックスの個体
     */
    getIndividual(index) {
        return this.individuals[index];
    }

    /**
     * 個体をPopulationに追加する
     * @param {Individual} individual - 追加する個体
     */
    pushIndividual(individual) {
        this.individuals.push(individual);
    }

    /**
     * Populationのサイズ（個体数を取得する）
     * @returns {number} - Populationのサイズ（個体数）
     */
    getSize() {
        return this.individuals.length;
    }

    /**
     * 別のPopulationインスタンスの個体をこのPopulationに追加する
     * @param {Population} otherPopulation - 他のPopulationインスタンス
     */
    add(otherPopulation) {
        this.individuals = this.individuals.concat(otherPopulation.individuals);
    }
}

class FitnessLog {
    constructor(maxDataPoints = 200) {
        this.log = [];
        this.generation = 0;
        this.generationInterval = 1; // the interval of generations to record data
        this.maxDataPoints = maxDataPoints; // the maximum number of data points to hold
    }

    pushLog(fitness) {
        if (this.generation % this.generationInterval === 0) {
            this.log.push({ x: this.generation, y: fitness });
            // if the data points exceeds the maximum limit
            if (this.log.length > this.maxDataPoints) {
                // console.log("before length:", this.log.length);
                this.generationInterval *= 2;
                // remove the old data that are not multiples of the new generation interval
                this.log = this.log.filter((item, index) => item.x % this.generationInterval === 0);
                // console.log("after length", this.log.length);
            }
        }
        this.generation++;
    }

    getLog() {
        return this.log;
    }
}

// Genetic Algorithm class
class GeneticAlgorithm {
    constructor(points, popSize, tournamentSize, mutationRate, elitism) {
        this.points = points;
        this.popSize = popSize;
        this.tournamentSize = tournamentSize;
        this.mutationRate = mutationRate;
        this.elitism = elitism;
        this.generation = 0;
        this.distanceMatrix = new DistanceMatrix(points);
        this.population = new Population(points, popSize);
        this.fitnessLog = new FitnessLog();
        this.fitnessLog.pushLog(this.getHighestFitnessInPopulation());
    }

    // Fitness calculation
    calculateFitness(individual) {
        let distance = 0;
        let route = individual.getRoute();
        for (let i = 0; i < route.length; i++) {
            distance += this.distanceMatrix.getDistance(route[i], route[(i + 1) % route.length]);
        }
        // Return fitness as inverse of distance
        return 1 / distance;
    }

    // Get the fittest individual from a population
    getFittest(population) {
        let fittest = population.getIndividual(0);
        let highestFitness = this.calculateFitness(fittest);

        for (let i = 1; i < population.getSize(); i++) {
            const individual = population.getIndividual(i);
            const fitness = this.calculateFitness(individual);
            // 更新
            if (fitness > highestFitness) {
                fittest = individual;
                highestFitness = fitness;
            }
        }
        return fittest;
    }

    // Get the fittest individual from the current population
    getFittestInPopulation() {
        return this.getFittest(this.population);
    }

    // Get the heighest fitness value in the current population
    getHighestFitnessInPopulation() {
        return this.calculateFitness(this.getFittestInPopulation());
    }

    getFitnessLog() {
        return this.fitnessLog;
    }

    // Tournament selection
    select() {
        const tournament = new Population(this.points, 0);
        // 1回のトーナメントに参加する個体に重複を許す
        for (let i = 0; i < this.tournamentSize; i++) {
            const randomId = Math.floor(Math.random() * this.popSize);
            tournament.pushIndividual(this.population.getIndividual(randomId));
        }
        return this.getFittest(tournament);
    }

    // Partially-mapped crossover (PMX)
    crossover(parent1, parent2) {
        const posCandidates = [...Array(this.points.getLength() - 1).keys()];
        const [startPos, endPos] = randomSelect(posCandidates, 2).sort();
        // console.log("parent1:", parent1.getRoute());
        // console.log("parent2:", parent2.getRoute());

        // console.log(startPos, endPos);

        const switchTable1 = {};
        const switchTable2 = {};

        for (let i = startPos; i < endPos; i++) {
            switchTable1[parent1.getGene(i)] = parent2.getGene(i);
            switchTable2[parent2.getGene(i)] = parent1.getGene(i);
        }
        // console.log(switchTable1);
        // console.log(switchTable2);

        let child1 = parent2.copy();
        let child2 = parent1.copy();

        const remIds = [...Array(this.points.getLength() - (endPos - startPos)).keys()].map(e => {
            return e < startPos ? e : e + (endPos - startPos);
        });
        for (const i of remIds) {
            let v1 = parent1.getGene(i);
            let v2 = parent2.getGene(i);
            let counter1 = 0, counter2 = 0;
            while (v1 in switchTable2) {
                v1 = switchTable2[v1];
                if (++counter1 > this.points.getLength()) throw "Infinite loop detected in crossover.";
            }
            child1.setGene(i, v1);
            while (v2 in switchTable1) {
                v2 = switchTable1[v2];
                if (++counter2 > this.points.getLength()) throw "Infinite loop detected in crossover.";
            }
            child2.setGene(i, v2);
        }

        return [child1, child2];
    }

    mutate(individual) {
        // console.log(individual.getRoute());
        // Apply mutation
        if (Math.random() < this.mutationRate) {
            const route = individual.getRoute();
            const routeLength = route.length;

            // Pick two random positions
            const [pos1, pos2] = randomSelect([...Array(this.points.getLength()).keys()], 2);
            // console.log(pos1, pos2);

            // Do the mutation (insertion)
            const temp = route[pos1];
            route.splice(pos1, 1);
            route.splice(pos2, 0, temp);
        }
        // console.log(individual.getRoute());
    }

    // Create a new generation
    createNewGeneration() {
        let newPopulation = new Population(this.points, 0);
        // エリート保存
        if (this.elitism) {
            newPopulation.pushIndividual(this.getFittestInPopulation());
        }
        while (newPopulation.getSize() < this.popSize) {
            let parent1 = this.select();
            let parent2 = this.select();
            let [child1, child2] = this.crossover(parent1, parent2);

            // Apply mutation to the children
            this.mutate(child1);
            this.mutate(child2);

            // if (checkDuplicates(child1.route) || checkDuplicates(child2.route)) throw "Duplication locations found in a child. Invalid solution.";
            // console.log("child1:", child1.getRoute());
            // console.log("child2:", child2.getRoute());
            newPopulation.pushIndividual(child1);
            if (newPopulation.getSize() < this.popSize) {
                newPopulation.pushIndividual(child2);
            }
        }
        this.population = newPopulation;
        // console.log(this.population.getSize());
        this.generation++;
        this.fitnessLog.pushLog(this.getHighestFitnessInPopulation());
    }

    // 進化を行うメソッド
    evolute(num) {
        const stopGeneration = this.generation + num;
        while (this.generation < stopGeneration) {
            this.createNewGeneration();
        }
    }

    // 突然変異率を設定
    setMutationRate(mutationRate) {
        this.mutationRate = mutationRate;
        // console.log(this.mutationRate);
    }

    // トーナメントサイズ設定
    setTournamentSize(tournamentSize) {
        this.tournamentSize = tournamentSize;
        // console.log(this.tournamentSize);
    }

    // エリート保存設定
    setElitism(elitism) {
        this.elitism = elitism;
    }

    /**
     * Resize the population to the target size.
     * If the target size is less than the current population size, the method reduces the population size using the tournament selection policy.
     * If the target size is greater, the method adds random individuals to the population until it reaches the target size.
     * 
     * @param {number} targetSize - The target population size.
     */
    resizePopulation(targetSize) {
        // If the current population size is equal to the target size, do nothing
        if (this.popSize === targetSize) {
            // console.log("same");
            return;
        }
        // If the current population size is greater than the target size, reduce the population according to the selection policy
        if (this.popSize > targetSize) {
            // console.log("less");
            this.reducePopulation(targetSize);
        }
        // If the current population size is less than the target size, add random individuals to the population
        else {
            // console.log("greater");
            this.increasePopulation(targetSize);
        }

        // Update the population size
        this.popSize = targetSize;
    }

    /**
     * Reduces the population size to the target size using the tournament selection policy.
     * If elitism is enabled, the fittest individual is preserved.
     * 
     * @param {number} targetSize - The target population size.
     */
    reducePopulation(targetSize) {
        let newPopulation = new Population(this.points, 0);

        if (this.elitism) {
            newPopulation.pushIndividual(this.getFittestInPopulation());
        }

        while (newPopulation.getSize() < targetSize) {
            newPopulation.pushIndividual(this.select());
        }

        this.population = newPopulation;
    }

    /**
     * Increases the population size to the target size by adding random individuals.
     * 
     * @param {number} targetSize - The target population size.
     */
    increasePopulation(targetSize) {
        const additionalPopulationSize = targetSize - this.popSize;
        const newPopulation = new Population(this.points, additionalPopulationSize);
        this.population.add(newPopulation);
    }
}

class GeneticAlgorithmOX extends GeneticAlgorithm {
    crossover(parent1, parent2) {
        const child1 = parent1.copy();
        const child2 = parent2.copy();

        const len = this.points.getLength();

        const [startPos, endPos] = randomSelect([...Array(len).keys()], 2).sort();
        // const [startPos, endPos] = [3, 7];

        const segment1 = parent1.getRoute().slice(startPos, endPos);
        const segment2 = parent2.getRoute().slice(startPos, endPos);

        const shiftedParent1Route = parent1.getRoute().slice(endPos).concat(parent1.getRoute().slice(0, endPos));
        const shiftedParent2Route = parent2.getRoute().slice(endPos).concat(parent2.getRoute().slice(0, endPos));

        const rest1 = shiftedParent2Route.filter((v) => !segment1.includes(v));
        const rest2 = shiftedParent1Route.filter((v) => !segment2.includes(v));

        // console.log("segment1:", segment1);
        // console.log("segment2:", segment2);
        // console.log("shiftedParent1Route:", shiftedParent1Route);
        // console.log("shiftedParent2Route:", shiftedParent2Route);
        // console.log("rest1:", rest1);
        // console.log("rest2:", rest2);

        const backLen = len - endPos;

        const newRoute1 = [...rest1.slice(backLen), ...segment1, ...rest1.slice(0, backLen)];
        const newRoute2 = [...rest2.slice(backLen), ...segment2, ...rest2.slice(0, backLen)];

        // console.log(startPos, endPos);
        // console.log(newRoute1);
        // console.log(newRoute2);

        child1.setRoute(newRoute1);
        child2.setRoute(newRoute2);

        return [child1, child2];
    }
}

class GeneticAlgorithmOX2Opt extends GeneticAlgorithmOX {
    mutate(individual) {
        // Apply mutation
        if (Math.random() < this.mutationRate) {
            const route = individual.getRoute();

            // Pick two random positions
            const [pos1, pos2] = randomSelect([...Array(this.points.getLength()).keys()], 2).sort();

            // 2-opt mutation
            // Swap two edges in the route by reversing the section between the chosen positions
            const reversed = route.slice(pos1, pos2).reverse();
            const newRoute = [...route.slice(0, pos1), ...reversed, ...route.slice(pos2)];
            individual.setRoute(newRoute);
        }
    }
}

// RouteGraphクラス
class RouteGraph {
    // コンストラクタ
    // canvasId: キャンバスのID
    // points: 座標の配列
    constructor(canvasId, points) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        this.points = points;

        // チャートデータの初期化
        this.data = {
            datasets: [{
                label: "Points", // ポイントのラベル
                data: this.points.points, // ポイントの座標
                pointRadius: 2,
                borderColor: "rgba(255, 200, 0, 1)",
                backgroundColor: "rgba(255, 200, 0, 0.2)",
                showLine: false // 線を表示しない
            }, {
                label: "Route", // 経路のラベル
                data: [], // 経路の座標（初期状態では空）
                showLine: true, // 線を表示する
                fill: false, // 塗りつぶしをしない
                borderColor: "rgba(192, 0, 0, 0.8)", // 線の色
                borderWidth: 2,
                lineTension: 0, // 線のカーブ（0で直線）
                showLine: true
            }]
        };

        // チャートの初期化
        this.chart = new Chart(this.ctx, {
            type: "scatter", // 散布図
            data: this.data,
            options: {
                animation: {
                    duration: 0 // アニメーションを無効（大量のデータを動的に更新する際に有用）
                },
                aspectRatio: 1
            }
        });
    }

    setPoints(points) {
        this.points = points;
        this.data.datasets[0].data = this.points.points;
    }

    // チャートの更新
    // individual: 経路情報
    update(individual) {
        // 経路データの更新
        this.data.datasets[1].data = applyPermutation(this.points.points, individual.getRoute());
        this.data.datasets[1].data.push(this.data.datasets[1].data[0]);
        // チャートの更新
        this.chart.update();
    }
}

class FitnessGraph {
    constructor(canvasId, log) {
        this.log = log;
        this.ctx = document.getElementById(canvasId).getContext("2d");

        this.chart = new Chart(this.ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: "Fitness",
                    data: [],
                    pointRadius: 1,
                    borderColor: "rgba(75, 192, 192, 1)",
                    backgroundColor: "rgba(75, 192, 192, 0.2)",
                    borderWidth: 1,
                    fill: false
                }]
            },
            options: {
                animation: false, // アニメーション無効
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Generation"
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: "Fitness"
                        }
                    }
                }
            }
        });
    }

    setLog(log) {
        this.log = log;
    }

    update() {
        const logData = this.log.getLog();
        this.chart.data.labels = logData.map(e => e.x);
        this.chart.data.datasets[0].data = logData.map(e => e.y);
        this.chart.update();
    }
}

class EvolutionController {

    constructor() {
        // Dom elements assignment
        this.assignDomElements();

        // Instance variables assgnment
        this.assignInstanceVariables();

        // Initial Graph Update
        this.updateGraphs();

        // Initial state setup
        this.init();
    }

    assignDomElements() {
        this.outputGeneration = document.getElementById("generation");
        this.inputConcentricCircles = document.getElementById("concentric-circles");
        this.inputRadiusRatio = document.getElementById("radius-ratio");
        this.inputNodeNum = document.getElementById("node-num");
        this.inputPopSize = document.getElementById("pop-size");
        this.inputMutationRate = document.getElementById("mutation-rate");
        this.inputTournamentSize = document.getElementById("tournament-size");
        this.inputElitism = document.getElementById("elitism");
        this.startButton = document.getElementById("start-button");
        this.stopButton = document.getElementById("stop-button");
    }

    assignInstanceVariables() {
        this.points = new Points(this.inputNodeNum.value);
        this.ga = new GeneticAlgorithmOX2Opt(
            this.points, this.inputPopSize.value, this.inputTournamentSize.value, this.inputMutationRate.value, this.inputElitism.checked);
        this.routeGraph = new RouteGraph("path", this.points);
        this.fitnessGraph = new FitnessGraph("graph", this.ga.getFitnessLog());

        // const p1 = new Individual(this.points, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(e => e - 1));
        // const p2 = new Individual(this.points, [4, 5, 2, 1, 8, 7, 6, 9, 3].map(e => e - 1));
        // this.ga.crossover(p1, p2);
        this.intervalID = null;
        this.running = false;
    }

    updateGraphs() {
        this.routeGraph.update(this.ga.getFittestInPopulation());
        this.fitnessGraph.update();
    }

    init() {
        this.initButtons();
        this.initInputs();
        this.outputGeneration.value = this.ga.generation;
    }

    initButtons() {
        this.startButton.addEventListener("click", () => this.start());
        this.stopButton.addEventListener("click", () => this.stop());
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
    }

    initInputs() {
        this.inputConcentricCircles.addEventListener("change", () => {
            this.inputNodeNum.disabled = this.inputConcentricCircles.checked;
            this.inputRadiusRatio.disabled = !this.inputConcentricCircles.checked;
            if (this.inputConcentricCircles.checked) {;
                this.inputNodeNum.value = 24;
                this.resetEnvironment();
            }
        });
        this.inputNodeNum.addEventListener("change", () => {
            this.resetEnvironment();
        });
        this.inputRadiusRatio.addEventListener("change", () => {
            this.resetEnvironment();
        });
        this.inputPopSize.addEventListener("change", () => {
            this.ga.resizePopulation(clampValue(this.inputPopSize));
        });
        this.inputMutationRate.addEventListener("change", () => {
            this.ga.setMutationRate(clampValue(this.inputMutationRate));
        });
        this.inputTournamentSize.addEventListener("change", () => {
            this.ga.setTournamentSize(clampValue(this.inputTournamentSize));
        });
        this.inputElitism.addEventListener("change", () => {
            this.ga.setElitism(this.inputElitism.checked);
        });
    }

    resetEnvironment() {
        this.points = new Points(clampValue(this.inputNodeNum));
        this.ga = new GeneticAlgorithmOX2Opt(
            this.points, this.inputPopSize.value, this.inputTournamentSize.value, this.inputMutationRate.value, this.inputElitism.checked);
        this.routeGraph.setPoints(this.points);
        this.fitnessGraph.setLog(this.ga.getFitnessLog());
        this.updateGraphs();
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.inputConcentricCircles.disabled = true;
        this.inputNodeNum.disabled = true;
        this.startButton.disabled = true;
        this.stopButton.disabled = false;

        // Run evolution
        const runEvolutionLoop = () => {
            if (!this.running) return;
            requestAnimationFrame(runEvolutionLoop);
            this.ga.evolute(20);
            this.updateGraphs();
            this.outputGeneration.value = this.ga.generation;
        };
        runEvolutionLoop();
    }

    stop() {
        if (!this.running) return;
        this.running = false;

        // Stop evolution
        this.inputConcentricCircles.disabled = false;
        this.inputNodeNum.disabled = false;
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
    }
}

/**
 * 入力された値が最小値と最大値の範囲内にあるかどうかを確認し、範囲外の場合は最小値または最大値に置き換える。
 * @param {HTMLInputElement} numElement - 数値入力欄
 * @returns {number} - 範囲内にある場合は入力された値、範囲外の場合は最小値または最大値
 */
function clampValue(numElement) {
    return Math.min(Math.max(numElement.value, numElement.min), numElement.max);
}

// Function to calculate distance between two points
function calculateDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// 配列arrayからランダムにnum個の要素を取り出す
function randomSelect(array, num) {
    let newArray = [];

    while (newArray.length < num && array.length > 0) {
        // 配列からランダムな要素を選ぶ
        const rand = Math.floor(Math.random() * array.length);
        // 選んだ要素を別の配列に登録する
        newArray.push(array[rand]);
        // もとの配列からは削除する
        array.splice(rand, 1);
    }
    return newArray;
}

// 重複検査
function checkDuplicates(array) {
    return (new Set(array)).size !== array.length;
}

// 順列を適用する関数
// array: 適用元の配列
// permutation: 順列
function applyPermutation(array, permutation) {
    const result = [];
    for (let i = 0; i < permutation.length; i++) {
        const index = permutation[i];
        result.push(array[index]);
    }
    return result;
}

function main() {
    new EvolutionController();

    const showGAParameterInputsCheckbox = document.getElementById("show-ga-parameter-inputs");
    const GAParameterInputs = document.getElementById("ga-parameter-inputs");
    showGAParameterInputsCheckbox.addEventListener("change", () => {
        if (showGAParameterInputsCheckbox.checked) {
            GAParameterInputs.style.display = "block";
        } else {
            GAParameterInputs.style.display = "none";
        }
    });
    const showEnvironmentSettingsCheckbox = document.getElementById("show-environment-settings");
    const environmentSettings = document.getElementById("environment-settings");
    showEnvironmentSettingsCheckbox.addEventListener("change", () => {
        if (showEnvironmentSettingsCheckbox.checked) {
            environmentSettings.style.display = "block";
        } else {
            environmentSettings.style.display = "none";
        }
    });
}

main();