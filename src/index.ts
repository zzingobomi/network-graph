import Graph from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import data from "./data.json";

const graph = new Graph();
graph.import(data);

const container = document.getElementById("sigma-container") as HTMLElement;

const sensibleSettings = forceAtlas2.inferSettings(graph);
const fa2Layout = new FA2Layout(graph, {
  settings: sensibleSettings,
});

const addRandomNodeButton = document.getElementById(
  "add-random-node-btn"
) as HTMLElement;

const addNodeName = document.getElementById(
  "add-node-name"
) as HTMLInputElement;
const addNodeX = document.getElementById("add-node-x") as HTMLInputElement;
const addNodeY = document.getElementById("add-node-y") as HTMLInputElement;
const addNodeSize = document.getElementById(
  "add-node-size"
) as HTMLInputElement;
const addNodeButton = document.getElementById("add-node-btn") as HTMLElement;

const removeNodeName = document.getElementById(
  "remove-node-name"
) as HTMLInputElement;
const removeNodeButton = document.getElementById(
  "remove-node-btn"
) as HTMLElement;

const addEdge1 = document.getElementById("add-edge-1") as HTMLInputElement;
const addEdge2 = document.getElementById("add-edge-2") as HTMLInputElement;
const addEdgeButton = document.getElementById("add-edge-btn") as HTMLElement;

const startFA2Button = document.getElementById("start-fa2-btn") as HTMLElement;
const stopFA2Button = document.getElementById("stop-fa2-btn") as HTMLElement;

const removeEdge1 = document.getElementById(
  "remove-edge-1"
) as HTMLInputElement;
const removeEdge2 = document.getElementById(
  "remove-edge-2"
) as HTMLInputElement;
const removeEdgeButton = document.getElementById(
  "remove-edge-btn"
) as HTMLElement;

addRandomNodeButton.addEventListener("click", handleAddRandomNode);
addNodeButton.addEventListener("click", handleAddNode);
removeNodeButton.addEventListener("click", handleRemoveNode);
addEdgeButton.addEventListener("click", handleAddEdge);
removeEdgeButton.addEventListener("click", handleRemoveEdge);

startFA2Button.addEventListener("click", handleStartFA2);
stopFA2Button.addEventListener("click", handleStopFA2);

function handleAddRandomNode() {
  const rdName = Math.random().toString(36).substr(2, 11);
  const rdX = Math.random() * 100;
  const rdY = Math.random() * 100;
  const rdSize = Math.random() * 20;
  graph.addNode(rdName, {
    x: rdX,
    y: rdY,
    size: rdSize,
    label: rdName,
    color: "#00ff00",
  });
}

function handleAddNode() {
  graph.addNode(addNodeName.value, {
    x: Number(addNodeX.value),
    y: Number(addNodeY.value),
    size: Number(addNodeSize.value),
    label: addNodeName.value,
    color: "#00ff00",
  });
}

function handleRemoveNode() {}

function handleAddEdge() {}

function handleRemoveEdge() {}

function handleStartFA2() {
  startFA2();
}

function handleStopFA2() {
  stopFA2();
}

let cancelCurrentAnimation: (() => void) | null = null;

function stopFA2() {
  fa2Layout.stop();
}
function startFA2() {
  if (cancelCurrentAnimation) cancelCurrentAnimation();
  fa2Layout.start();
}

const renderer = new Sigma(graph, container);

/*
import Graph from "graphology";
import Sigma from "./sigma";
//import Sigma from "sigma";

const container = document.getElementById("sigma-container") as HTMLElement;

const graph = new Graph();

graph.addNode("John", { x: 0, y: 10, size: 5, label: "John", color: "blue" });
graph.addNode("Mary", { x: 10, y: 0, size: 3, label: "Mary", color: "red" });

graph.addEdge("John", "Mary");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
//const renderer = new Sigma(graph, container);
const renderer2 = new Sigma(graph, container);
*/
