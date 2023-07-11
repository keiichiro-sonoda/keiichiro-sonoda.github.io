class Points {
    constructor(num) {
        this.points = [];
        // 座標をランダムに生成
        for (let i = 0; i < num; i++) {
            this.points.push({
                x: Math.random(),
                y: Math.random()
            });
            // this.points.push({
            //     x: Math.cos(2 * i * Math.PI / num) * canvas.width / 2 + canvas.width / 2,
            //     y: Math.sin(2 * i * Math.PI / num) * canvas.height / 2 + canvas.height / 2,
            // });
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

// Population class
class Population {
    constructor(points, size) {
        this.individuals = [];
        for (let i = 0; i < size; i++) {
            this.individuals.push(new Individual(points));
        }
    }

    getIndividual(index) {
        return this.individuals[index];
    }

    pushIndividual(individual) {
        this.individuals.push(individual);
    }

    getSize() {
        return this.individuals.length;
    }
}

class FitnessLog {
    constructor(maxDataPoints=200) {
        this.log = [];
        this.generation = 0;
        this.generationInterval = 1; // the interval of generations to record data
        this.maxDataPoints = maxDataPoints; // the maximum number of data points to hold
    }

    pushLog(fitness) {
        if (this.generation % this.generationInterval === 0) {
            this.log.push({x: this.generation, y: fitness});
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
    constructor(points, popSize, tournamentSize, mutationRate) {
        this.points = points;
        this.popSize = popSize;
        this.tournamentSize = tournamentSize;
        this.mutationRate = mutationRate;
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

    // チャートの更新
    // individual: 経路情報
    update(individual) {
        // 経路データの更新
        this.data.datasets[1].data = applyPermutation(this.points.points, individual.getRoute());
        // チャートの更新
        this.chart.update();
    }
}

class FitnessGraph {
    constructor(log, canvasId) {
        this.log = log;
        this.ctx = document.getElementById(canvasId).getContext("2d");

        this.chart = new Chart(this.ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: "Fitness",
                    data: [],
                    borderColor: "rgba(75, 192, 192, 1)",
                    backgroundColor: "rgba(75, 192, 192, 0.2)",
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

    update() {
        const logData = this.log.getLog();
        this.chart.data.labels = logData.map(e => e.x);
        this.chart.data.datasets[0].data = logData.map(e => e.y);
        this.chart.update();
    }
}

class EvolutionController {

    constructor(pointNum, size, mutationRate, fitnessGraphId, routeGraphId, startButtonId, stopButtonId) {
        this.points = new Points(pointNum);
        this.ga = new GeneticAlgorithmOX2Opt(this.points, size, 3, mutationRate);
        // const p1 = new Individual(this.points, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(e => e - 1));
        // const p2 = new Individual(this.points, [4, 5, 2, 1, 8, 7, 6, 9, 3].map(e => e - 1));
        // this.ga.crossover(p1, p2);
        this.fitnessGraph = new FitnessGraph(this.ga.getFitnessLog(), fitnessGraphId);
        this.routeGraph = new RouteGraph(routeGraphId, this.points);
        this.intervalID = null;
        this.running = false;

        this.startButton = document.getElementById(startButtonId);
        this.stopButton = document.getElementById(stopButtonId);

        this.init();
    }

    init() {
        this.fitnessGraph.update();
        this.routeGraph.update(this.ga.getFittestInPopulation());

        // Add event listener to the start button
        this.startButton.addEventListener("click", () => this.start());

        // Add event listener to the stop button
        this.stopButton.addEventListener("click", () => this.stop());
    }

    start() {
        if (this.running) return;
        this.running = true;

        // Run evolution
        this.intervalID = setInterval(() => {
            this.ga.evolute(20);
            this.fitnessGraph.update();
            this.routeGraph.update(this.ga.getFittestInPopulation());
        }, 0);
    }

    stop() {
        if (!this.running) return;
        this.running = false;

        // Stop evolution
        clearInterval(this.intervalID);
    }
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
    let pointNum = 500;
    let size = 100;
    let mutationRate = 0.25;

    new EvolutionController(pointNum, size, mutationRate, "graph", "canvas", "start-button", "stop-button");
}

main();