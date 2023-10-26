/**
 * Sigma.js
 * ========
 * @module
 */
import Graph from "graphology-types";
import extend from "@yomguithereal/helpers/extend";

import Camera from "./core/camera";
import {
  CameraState,
  Coordinates,
  Dimensions,
  EdgeDisplayData,
  Extent,
  Listener,
  MouseCoords,
  NodeDisplayData,
  PlainObject,
  CoordinateConversionOverride,
  TypedEventEmitter,
  MouseInteraction,
} from "./types";
import {
  createElement,
  getPixelRatio,
  createNormalizationFunction,
  NormalizationFunction,
  cancelFrame,
  matrixFromCamera,
  requestFrame,
  validateGraph,
  zIndexOrdering,
  getMatrixImpact,
  graphExtent,
} from "./utils";

import { Settings, validateSettings, resolveSettings } from "./settings";
import { INodeProgram } from "./rendering/webgl/programs/common/node";
import { identity, multiplyVec2 } from "./utils/matrices";

/**
 * Important functions.
 */
function applyNodeDefaults(
  settings: Settings,
  key: string,
  data: Partial<NodeDisplayData>
): NodeDisplayData {
  if (!data.hasOwnProperty("x") || !data.hasOwnProperty("y"))
    throw new Error(
      `Sigma: could not find a valid position (x, y) for node "${key}". All your nodes must have a number "x" and "y". Maybe your forgot to apply a layout or your "nodeReducer" is not returning the correct data?`
    );

  if (!data.color) data.color = settings.defaultNodeColor;

  if (!data.label && data.label !== "") data.label = null;

  if (data.label !== undefined && data.label !== null)
    data.label = "" + data.label;
  else data.label = null;

  if (!data.size) data.size = 2;

  if (!data.hasOwnProperty("hidden")) data.hidden = false;

  if (!data.hasOwnProperty("highlighted")) data.highlighted = false;

  if (!data.hasOwnProperty("forceLabel")) data.forceLabel = false;

  if (!data.type || data.type === "") data.type = settings.defaultNodeType;

  if (!data.zIndex) data.zIndex = 0;

  return data as NodeDisplayData;
}

function applyEdgeDefaults(
  settings: Settings,
  key: string,
  data: Partial<EdgeDisplayData>
): EdgeDisplayData {
  if (!data.color) data.color = settings.defaultEdgeColor;

  if (!data.label) data.label = "";

  if (!data.size) data.size = 0.5;

  if (!data.hasOwnProperty("hidden")) data.hidden = false;

  if (!data.hasOwnProperty("forceLabel")) data.forceLabel = false;

  if (!data.type || data.type === "") data.type = settings.defaultEdgeType;

  if (!data.zIndex) data.zIndex = 0;

  return data as EdgeDisplayData;
}

/**
 * Event types.
 */
export interface SigmaEventPayload {
  event: MouseCoords;
  preventSigmaDefault(): void;
}

export interface SigmaStageEventPayload extends SigmaEventPayload {}
export interface SigmaNodeEventPayload extends SigmaEventPayload {
  node: string;
}
export interface SigmaEdgeEventPayload extends SigmaEventPayload {
  edge: string;
}

export type SigmaStageEvents = {
  [E in MouseInteraction as `${E}Stage`]: (
    payload: SigmaStageEventPayload
  ) => void;
};

export type SigmaNodeEvents = {
  [E in MouseInteraction as `${E}Node`]: (
    payload: SigmaNodeEventPayload
  ) => void;
};

export type SigmaEdgeEvents = {
  [E in MouseInteraction as `${E}Edge`]: (
    payload: SigmaEdgeEventPayload
  ) => void;
};

export type SigmaAdditionalEvents = {
  // Lifecycle events
  beforeRender(): void;
  afterRender(): void;
  resize(): void;
  kill(): void;

  // Additional node events
  enterNode(payload: SigmaNodeEventPayload): void;
  leaveNode(payload: SigmaNodeEventPayload): void;

  // Additional edge events
  enterEdge(payload: SigmaEdgeEventPayload): void;
  leaveEdge(payload: SigmaEdgeEventPayload): void;
};

export type SigmaEvents = SigmaStageEvents &
  SigmaNodeEvents &
  SigmaEdgeEvents &
  SigmaAdditionalEvents;

/**
 * Main class.
 *
 * @constructor
 * @param {Graph}       graph     - Graph to render.
 * @param {HTMLElement} container - DOM container in which to render.
 * @param {object}      settings  - Optional settings.
 */
export default class Sigma<
  GraphType extends Graph = Graph
> extends TypedEventEmitter<SigmaEvents> {
  private settings: Settings;
  private graph: GraphType;
  private container: HTMLElement;
  private elements: PlainObject<HTMLCanvasElement> = {};
  private canvasContexts: PlainObject<CanvasRenderingContext2D> = {};
  private webGLContexts: PlainObject<WebGLRenderingContext> = {};
  private activeListeners: PlainObject<Listener> = {};
  private nodeDataCache: Record<string, NodeDisplayData> = {};
  private edgeDataCache: Record<string, EdgeDisplayData> = {};
  private nodesWithForcedLabels: string[] = [];
  private edgesWithForcedLabels: string[] = [];
  private nodeExtent: { x: Extent; y: Extent } = { x: [0, 1], y: [0, 1] };

  private matrix: Float32Array = identity();
  private invMatrix: Float32Array = identity();
  private correctionRatio = 1;
  private customBBox: { x: Extent; y: Extent } | null = null;
  private normalizationFunction: NormalizationFunction =
    createNormalizationFunction({
      x: [0, 1],
      y: [0, 1],
    });

  // Cache:
  private cameraSizeRatio = 1;

  // Starting dimensions and pixel ratio
  private width = 0;
  private height = 0;
  private pixelRatio = getPixelRatio();

  // State
  private displayedLabels: Set<string> = new Set();
  private highlightedNodes: Set<string> = new Set();
  private hoveredNode: string | null = null;
  private hoveredEdge: string | null = null;
  private renderFrame: number | null = null;
  private renderHighlightedNodesFrame: number | null = null;
  private needToProcess = false;
  private needToSoftProcess = false;
  private checkEdgesEventsFrame: number | null = null;

  // Programs
  private nodePrograms: { [key: string]: INodeProgram } = {};

  private camera: Camera;

  constructor(
    graph: GraphType,
    container: HTMLElement,
    settings: Partial<Settings> = {}
  ) {
    super();

    // Resolving settings
    this.settings = resolveSettings(settings);

    // Validating
    validateSettings(this.settings);
    validateGraph(graph);
    if (!(container instanceof HTMLElement))
      throw new Error("Sigma: container should be an html element.");

    // Properties
    this.graph = graph;
    this.container = container;

    // Initializing contexts
    this.createWebGLContext("nodes");

    // Blending
    for (const key in this.webGLContexts) {
      const gl = this.webGLContexts[key];

      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
    }

    // Loading programs
    for (const type in this.settings.nodeProgramClasses) {
      const NodeProgramClass = this.settings.nodeProgramClasses[type];
      this.nodePrograms[type] = new NodeProgramClass(
        this.webGLContexts.nodes,
        this
      );
    }

    // Initial resize
    this.resize();

    // Initializing the camera
    this.camera = new Camera();

    // Binding camera events
    this.bindCameraHandlers();

    // Binding event handlers
    this.bindEventHandlers();

    // Binding graph handlers
    this.bindGraphHandlers();

    // Trigger eventual settings-related things
    this.handleSettingsUpdate();

    // Processing data for the first time & render
    this.process();
    this.render();
  }

  /**---------------------------------------------------------------------------
   * Internal methods.
   **---------------------------------------------------------------------------
   */

  /**
   * Internal function used to create a canvas element.
   * @param  {string} id - Context's id.
   * @return {Sigma}
   */
  private createCanvas(id: string): HTMLCanvasElement {
    const canvas: HTMLCanvasElement = createElement<HTMLCanvasElement>(
      "canvas",
      {
        position: "absolute",
      },
      {
        class: `sigma-${id}`,
      }
    );

    this.elements[id] = canvas;
    this.container.appendChild(canvas);

    return canvas;
  }

  /**
   * Internal function used to create a canvas context and add the relevant
   * DOM elements.
   *
   * @param  {string} id - Context's id.
   * @return {Sigma}
   */
  private createCanvasContext(id: string): this {
    const canvas = this.createCanvas(id);

    const contextOptions = {
      preserveDrawingBuffer: false,
      antialias: false,
    };

    this.canvasContexts[id] = canvas.getContext(
      "2d",
      contextOptions
    ) as CanvasRenderingContext2D;

    return this;
  }

  /**
   * Internal function used to create a canvas context and add the relevant
   * DOM elements.
   *
   * @param  {string}  id      - Context's id.
   * @param  {object?} options - #getContext params to override (optional)
   * @return {Sigma}
   */
  private createWebGLContext(
    id: string,
    options?: { preserveDrawingBuffer?: boolean; antialias?: boolean }
  ): this {
    const canvas = this.createCanvas(id);

    const contextOptions = {
      preserveDrawingBuffer: false,
      antialias: false,
      ...(options || {}),
    };

    let context;

    // First we try webgl2 for an easy performance boost
    context = canvas.getContext("webgl2", contextOptions);

    // Else we fall back to webgl
    if (!context) context = canvas.getContext("webgl", contextOptions);

    // Edge, I am looking right at you...
    if (!context)
      context = canvas.getContext("experimental-webgl", contextOptions);

    this.webGLContexts[id] = context as WebGLRenderingContext;

    return this;
  }

  /**
   * Method binding camera handlers.
   *
   * @return {Sigma}
   */
  private bindCameraHandlers(): this {
    this.activeListeners.camera = () => {
      this._scheduleRefresh();
    };

    this.camera.on("updated", this.activeListeners.camera);

    return this;
  }

  /**
   * Method that checks whether or not a node collides with a given position.
   */
  private mouseIsOnNode(
    { x, y }: Coordinates,
    { x: nodeX, y: nodeY }: Coordinates,
    size: number
  ): boolean {
    return (
      x > nodeX - size &&
      x < nodeX + size &&
      y > nodeY - size &&
      y < nodeY + size &&
      Math.sqrt(Math.pow(x - nodeX, 2) + Math.pow(y - nodeY, 2)) < size
    );
  }

  /**
   * Method binding event handlers.
   *
   * @return {Sigma}
   */
  private bindEventHandlers(): this {
    // Handling window resize
    this.activeListeners.handleResize = () => {
      this.needToSoftProcess = true;
      this._scheduleRefresh();
    };

    window.addEventListener("resize", this.activeListeners.handleResize);

    return this;
  }

  /**
   * Method binding graph handlers
   *
   * @return {Sigma}
   */
  private bindGraphHandlers(): this {
    const graph = this.graph;

    this.activeListeners.graphUpdate = () => {
      this.needToProcess = true;
      this._scheduleRefresh();
    };

    this.activeListeners.softGraphUpdate = () => {
      this.needToSoftProcess = true;
      this._scheduleRefresh();
    };

    this.activeListeners.dropNodeGraphUpdate = (e: { key: string }): void => {
      delete this.nodeDataCache[e.key];

      if (this.hoveredNode === e.key) this.hoveredNode = null;

      this.activeListeners.graphUpdate();
    };

    this.activeListeners.dropEdgeGraphUpdate = (e: { key: string }): void => {
      delete this.edgeDataCache[e.key];

      if (this.hoveredEdge === e.key) this.hoveredEdge = null;

      this.activeListeners.graphUpdate();
    };

    this.activeListeners.clearEdgesGraphUpdate = (): void => {
      this.edgeDataCache = {};
      this.hoveredEdge = null;

      this.activeListeners.graphUpdate();
    };

    this.activeListeners.clearGraphUpdate = (): void => {
      this.nodeDataCache = {};
      this.hoveredNode = null;

      this.activeListeners.clearEdgesGraphUpdate();
    };

    graph.on("nodeAdded", this.activeListeners.graphUpdate);
    graph.on("nodeDropped", this.activeListeners.dropNodeGraphUpdate);
    graph.on("nodeAttributesUpdated", this.activeListeners.softGraphUpdate);
    graph.on("eachNodeAttributesUpdated", this.activeListeners.graphUpdate);
    graph.on("edgeAdded", this.activeListeners.graphUpdate);
    graph.on("edgeDropped", this.activeListeners.dropEdgeGraphUpdate);
    graph.on("edgeAttributesUpdated", this.activeListeners.softGraphUpdate);
    graph.on("eachEdgeAttributesUpdated", this.activeListeners.graphUpdate);
    graph.on("edgesCleared", this.activeListeners.clearEdgesGraphUpdate);
    graph.on("cleared", this.activeListeners.clearGraphUpdate);

    return this;
  }

  /**
   * Method used to unbind handlers from the graph.
   *
   * @return {undefined}
   */
  private unbindGraphHandlers() {
    const graph = this.graph;

    graph.removeListener("nodeAdded", this.activeListeners.graphUpdate);
    graph.removeListener(
      "nodeDropped",
      this.activeListeners.dropNodeGraphUpdate
    );
    graph.removeListener(
      "nodeAttributesUpdated",
      this.activeListeners.softGraphUpdate
    );
    graph.removeListener(
      "eachNodeAttributesUpdated",
      this.activeListeners.graphUpdate
    );
    graph.removeListener("edgeAdded", this.activeListeners.graphUpdate);
    graph.removeListener(
      "edgeDropped",
      this.activeListeners.dropEdgeGraphUpdate
    );
    graph.removeListener(
      "edgeAttributesUpdated",
      this.activeListeners.softGraphUpdate
    );
    graph.removeListener(
      "eachEdgeAttributesUpdated",
      this.activeListeners.graphUpdate
    );
    graph.removeListener(
      "edgesCleared",
      this.activeListeners.clearEdgesGraphUpdate
    );
    graph.removeListener("cleared", this.activeListeners.clearGraphUpdate);
  }

  /**
   * Method used to process the whole graph's data.
   *
   * @return {Sigma}
   */
  private process(keepArrays = false): this {
    const graph = this.graph;
    const settings = this.settings;
    const dimensions = this.getDimensions();

    const nodeZExtent: [number, number] = [Infinity, -Infinity];
    const edgeZExtent: [number, number] = [Infinity, -Infinity];

    // Clear the highlightedNodes
    this.highlightedNodes = new Set();

    // Computing extents
    this.nodeExtent = graphExtent(graph);

    // Resetting `forceLabel` indices
    this.nodesWithForcedLabels = [];
    this.edgesWithForcedLabels = [];

    // NOTE: it is important to compute this matrix after computing the node's extent
    // because #.getGraphDimensions relies on it
    const nullCamera = new Camera();
    const nullCameraMatrix = matrixFromCamera(
      nullCamera.getState(),
      this.getDimensions(),
      this.getGraphDimensions(),
      this.getSetting("stagePadding") || 0
    );

    // Rescaling function
    this.normalizationFunction = createNormalizationFunction(
      this.customBBox || this.nodeExtent
    );

    const nodesPerPrograms: Record<string, number> = {};

    let nodes = graph.nodes();

    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];

      // Node display data resolution:
      //   1. First we get the node's attributes
      //   2. We optionally reduce them using the function provided by the user
      //      Note that this function must return a total object and won't be merged
      //   3. We apply our defaults, while running some vital checks
      //   4. We apply the normalization function

      // We shallow copy node data to avoid dangerous behaviors from reducers
      let attr = Object.assign({}, graph.getNodeAttributes(node));

      if (settings.nodeReducer) attr = settings.nodeReducer(node, attr);

      const data = applyNodeDefaults(this.settings, node, attr);

      nodesPerPrograms[data.type] = (nodesPerPrograms[data.type] || 0) + 1;
      this.nodeDataCache[node] = data;

      this.normalizationFunction.applyTo(data);

      if (data.forceLabel) this.nodesWithForcedLabels.push(node);

      if (this.settings.zIndex) {
        if (data.zIndex < nodeZExtent[0]) nodeZExtent[0] = data.zIndex;
        if (data.zIndex > nodeZExtent[1]) nodeZExtent[1] = data.zIndex;
      }
    }

    for (const type in this.nodePrograms) {
      if (!this.nodePrograms.hasOwnProperty(type)) {
        throw new Error(
          `Sigma: could not find a suitable program for node type "${type}"!`
        );
      }

      if (!keepArrays)
        this.nodePrograms[type].allocate(nodesPerPrograms[type] || 0);
      // We reset that count here, so that we can reuse it while calling the Program#process methods:
      nodesPerPrograms[type] = 0;
    }

    // Handling node z-index
    // TODO: z-index needs us to compute display data before hand
    if (this.settings.zIndex && nodeZExtent[0] !== nodeZExtent[1])
      nodes = zIndexOrdering<string>(
        nodeZExtent,
        (node: string): number => this.nodeDataCache[node].zIndex,
        nodes
      );

    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];

      const nodeProgram = this.nodePrograms[data.type];
      if (!nodeProgram)
        throw new Error(
          `Sigma: could not find a suitable program for node type "${data.type}"!`
        );
      nodeProgram.process(data, data.hidden, nodesPerPrograms[data.type]++);

      // Save the node in the highlighted set if needed
      if (data.highlighted && !data.hidden) this.highlightedNodes.add(node);
    }

    const edgesPerPrograms: Record<string, number> = {};

    let edges = graph.edges();

    for (let i = 0, l = edges.length; i < l; i++) {
      const edge = edges[i];

      // Edge display data resolution:
      //   1. First we get the edge's attributes
      //   2. We optionally reduce them using the function provided by the user
      //      Note that this function must return a total object and won't be merged
      //   3. We apply our defaults, while running some vital checks

      // We shallow copy edge data to avoid dangerous behaviors from reducers
      let attr = Object.assign({}, graph.getEdgeAttributes(edge));

      if (settings.edgeReducer) attr = settings.edgeReducer(edge, attr);

      const data = applyEdgeDefaults(this.settings, edge, attr);

      edgesPerPrograms[data.type] = (edgesPerPrograms[data.type] || 0) + 1;
      this.edgeDataCache[edge] = data;

      if (data.forceLabel && !data.hidden)
        this.edgesWithForcedLabels.push(edge);

      if (this.settings.zIndex) {
        if (data.zIndex < edgeZExtent[0]) edgeZExtent[0] = data.zIndex;
        if (data.zIndex > edgeZExtent[1]) edgeZExtent[1] = data.zIndex;
      }
    }

    return this;
  }

  /**
   * Method that backports potential settings updates where it's needed.
   * @private
   */
  private handleSettingsUpdate(): this {
    this.camera.minRatio = this.settings.minCameraRatio;
    this.camera.maxRatio = this.settings.maxCameraRatio;
    this.camera.setState(this.camera.validateState(this.camera.getState()));

    return this;
  }

  /**
   * Method that decides whether to reprocess graph or not, and then render the
   * graph.
   *
   * @return {Sigma}
   */
  private _refresh(): this {
    // Do we need to process data?
    if (this.needToProcess) {
      this.process();
    } else if (this.needToSoftProcess) {
      this.process(true);
    }

    // Resetting state
    this.needToProcess = false;
    this.needToSoftProcess = false;

    // Rendering
    this.render();

    return this;
  }

  /**
   * Method that schedules a `_refresh` call if none has been scheduled yet. It
   * will then be processed next available frame.
   *
   * @return {Sigma}
   */
  private _scheduleRefresh(): this {
    if (!this.renderFrame) {
      this.renderFrame = requestFrame(() => {
        this._refresh();
        this.renderFrame = null;
      });
    }

    return this;
  }

  /**
   * Method used to render.
   *
   * @return {Sigma}
   */
  private render(): this {
    this.emit("beforeRender");

    const exitRender = () => {
      this.emit("afterRender");
      return this;
    };

    // If a render was scheduled, we cancel it
    if (this.renderFrame) {
      cancelFrame(this.renderFrame);
      this.renderFrame = null;
      this.needToProcess = false;
      this.needToSoftProcess = false;
    }

    // First we need to resize
    this.resize();

    // Clearing the canvases
    this.clear();

    // Recomputing useful camera-related values:
    this.updateCachedValues();

    // If we have no nodes we can stop right there
    if (!this.graph.order) return exitRender();

    // Then we need to extract a matrix from the camera
    const cameraState = this.camera.getState();
    const viewportDimensions = this.getDimensions();
    const graphDimensions = this.getGraphDimensions();
    const padding = this.getSetting("stagePadding") || 0;
    this.matrix = matrixFromCamera(
      cameraState,
      viewportDimensions,
      graphDimensions,
      padding
    );
    this.invMatrix = matrixFromCamera(
      cameraState,
      viewportDimensions,
      graphDimensions,
      padding,
      true
    );
    this.correctionRatio = getMatrixImpact(
      this.matrix,
      cameraState,
      viewportDimensions
    );

    // Drawing nodes
    for (const type in this.nodePrograms) {
      const program = this.nodePrograms[type];

      program.bind();
      program.bufferData();
      program.render({
        matrix: this.matrix,
        width: this.width,
        height: this.height,
        ratio: cameraState.ratio,
        correctionRatio: this.correctionRatio / cameraState.ratio,
        scalingRatio: this.pixelRatio,
      });
    }

    return exitRender();
  }

  /**
   * Internal method used to update expensive and therefore cached values
   * each time the camera state is updated.
   */
  private updateCachedValues(): void {
    const { ratio } = this.camera.getState();
    this.cameraSizeRatio = Math.sqrt(ratio);
  }

  /**---------------------------------------------------------------------------
   * Public API.
   **---------------------------------------------------------------------------
   */

  /**
   * Method returning the renderer's camera.
   *
   * @return {Camera}
   */
  getCamera(): Camera {
    return this.camera;
  }

  /**
   * Method returning the container DOM element.
   *
   * @return {HTMLElement}
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Method returning the renderer's graph.
   *
   * @return {Graph}
   */
  getGraph(): GraphType {
    return this.graph;
  }

  /**
   * Method used to set the renderer's graph.
   *
   * @return {Graph}
   */
  setGraph(graph: GraphType): void {
    if (graph === this.graph) return;

    // Unbinding handlers on the current graph
    this.unbindGraphHandlers();

    // Clearing the graph data caches
    this.nodeDataCache = {};
    this.edgeDataCache = {};

    // Cleaning renderer state tied to the current graph
    this.displayedLabels.clear();
    this.highlightedNodes.clear();
    this.hoveredNode = null;
    this.hoveredEdge = null;
    this.nodesWithForcedLabels.length = 0;
    this.edgesWithForcedLabels.length = 0;

    if (this.checkEdgesEventsFrame !== null) {
      cancelFrame(this.checkEdgesEventsFrame);
      this.checkEdgesEventsFrame = null;
    }

    // Installing new graph
    this.graph = graph;

    // Binding new handlers
    this.bindGraphHandlers();

    // Re-rendering now to avoid discrepancies from now to next frame
    this.process();
    this.render();
  }

  /**
   * Method returning the current renderer's dimensions.
   *
   * @return {Dimensions}
   */
  getDimensions(): Dimensions {
    return { width: this.width, height: this.height };
  }

  /**
   * Method returning the current graph's dimensions.
   *
   * @return {Dimensions}
   */
  getGraphDimensions(): Dimensions {
    const extent = this.customBBox || this.nodeExtent;

    return {
      width: extent.x[1] - extent.x[0] || 1,
      height: extent.y[1] - extent.y[0] || 1,
    };
  }

  /**
   * Method used to get all the sigma node attributes.
   * It's usefull for example to get the position of a node
   * and to get values that are set by the nodeReducer
   *
   * @param  {string} key - The node's key.
   * @return {NodeDisplayData | undefined} A copy of the desired node's attribute or undefined if not found
   */
  getNodeDisplayData(key: unknown): NodeDisplayData | undefined {
    const node = this.nodeDataCache[key as string];
    return node ? Object.assign({}, node) : undefined;
  }

  /**
   * Method used to get all the sigma edge attributes.
   * It's usefull for example to get values that are set by the edgeReducer.
   *
   * @param  {string} key - The edge's key.
   * @return {EdgeDisplayData | undefined} A copy of the desired edge's attribute or undefined if not found
   */
  getEdgeDisplayData(key: unknown): EdgeDisplayData | undefined {
    const edge = this.edgeDataCache[key as string];
    return edge ? Object.assign({}, edge) : undefined;
  }

  /**
   * Method returning a copy of the settings collection.
   *
   * @return {Settings} A copy of the settings collection.
   */
  getSettings(): Settings {
    return { ...this.settings };
  }

  /**
   * Method returning the current value for a given setting key.
   *
   * @param  {string} key - The setting key to get.
   * @return {any} The value attached to this setting key or undefined if not found
   */
  getSetting<K extends keyof Settings>(key: K): Settings[K] | undefined {
    return this.settings[key];
  }

  /**
   * Method setting the value of a given setting key. Note that this will schedule
   * a new render next frame.
   *
   * @param  {string} key - The setting key to set.
   * @param  {any}    value - The value to set.
   * @return {Sigma}
   */
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): this {
    this.settings[key] = value;
    validateSettings(this.settings);
    this.handleSettingsUpdate();
    this.needToProcess = true; // TODO: some keys may work with only needToSoftProcess or even nothing
    this._scheduleRefresh();
    return this;
  }

  /**
   * Method updating the value of a given setting key using the provided function.
   * Note that this will schedule a new render next frame.
   *
   * @param  {string}   key     - The setting key to set.
   * @param  {function} updater - The update function.
   * @return {Sigma}
   */
  updateSetting<K extends keyof Settings>(
    key: K,
    updater: (value: Settings[K]) => Settings[K]
  ): this {
    this.settings[key] = updater(this.settings[key]);
    validateSettings(this.settings);
    this.handleSettingsUpdate();
    this.needToProcess = true; // TODO: some keys may work with only needToSoftProcess or even nothing
    this._scheduleRefresh();
    return this;
  }

  /**
   * Method used to resize the renderer.
   *
   * @return {Sigma}
   */
  resize(): this {
    const previousWidth = this.width,
      previousHeight = this.height;

    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.pixelRatio = getPixelRatio();

    if (this.width === 0) {
      if (this.settings.allowInvalidContainer) this.width = 1;
      else
        throw new Error(
          "Sigma: Container has no width. You can set the allowInvalidContainer setting to true to stop seeing this error."
        );
    }

    if (this.height === 0) {
      if (this.settings.allowInvalidContainer) this.height = 1;
      else
        throw new Error(
          "Sigma: Container has no height. You can set the allowInvalidContainer setting to true to stop seeing this error."
        );
    }

    // If nothing has changed, we can stop right here
    if (previousWidth === this.width && previousHeight === this.height)
      return this;

    this.emit("resize");

    // Sizing dom elements
    for (const id in this.elements) {
      const element = this.elements[id];

      element.style.width = this.width + "px";
      element.style.height = this.height + "px";
    }

    // Sizing canvas contexts
    for (const id in this.canvasContexts) {
      this.elements[id].setAttribute(
        "width",
        this.width * this.pixelRatio + "px"
      );
      this.elements[id].setAttribute(
        "height",
        this.height * this.pixelRatio + "px"
      );

      if (this.pixelRatio !== 1)
        this.canvasContexts[id].scale(this.pixelRatio, this.pixelRatio);
    }

    // Sizing WebGL contexts
    for (const id in this.webGLContexts) {
      this.elements[id].setAttribute(
        "width",
        this.width * this.pixelRatio + "px"
      );
      this.elements[id].setAttribute(
        "height",
        this.height * this.pixelRatio + "px"
      );

      this.webGLContexts[id].viewport(
        0,
        0,
        this.width * this.pixelRatio,
        this.height * this.pixelRatio
      );
    }

    return this;
  }

  /**
   * Method used to clear all the canvases.
   *
   * @return {Sigma}
   */
  clear(): this {
    this.webGLContexts.nodes.clear(this.webGLContexts.nodes.COLOR_BUFFER_BIT);

    return this;
  }

  /**
   * Method used to refresh all computed data.
   *
   * @return {Sigma}
   */
  refresh(): this {
    this.needToProcess = true;
    this._refresh();

    return this;
  }

  /**
   * Method used to refresh all computed data, at the next available frame.
   * If this method has already been called this frame, then it will only render once at the next available frame.
   *
   * @return {Sigma}
   */
  scheduleRefresh(): this {
    this.needToProcess = true;
    this._scheduleRefresh();

    return this;
  }

  /**
   * Method used to (un)zoom, while preserving the position of a viewport point.
   * Used for instance to zoom "on the mouse cursor".
   *
   * @param viewportTarget
   * @param newRatio
   * @return {CameraState}
   */
  getViewportZoomedState(
    viewportTarget: Coordinates,
    newRatio: number
  ): CameraState {
    const { ratio, angle, x, y } = this.camera.getState();

    // TODO: handle max zoom
    const ratioDiff = newRatio / ratio;

    const center = {
      x: this.width / 2,
      y: this.height / 2,
    };

    const graphMousePosition = this.viewportToFramedGraph(viewportTarget);
    const graphCenterPosition = this.viewportToFramedGraph(center);

    return {
      angle,
      x: (graphMousePosition.x - graphCenterPosition.x) * (1 - ratioDiff) + x,
      y: (graphMousePosition.y - graphCenterPosition.y) * (1 - ratioDiff) + y,
      ratio: newRatio,
    };
  }

  /**
   * Method returning the abstract rectangle containing the graph according
   * to the camera's state.
   *
   * @return {object} - The view's rectangle.
   */
  viewRectangle(): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    height: number;
  } {
    // TODO: reduce relative margin?
    const marginX = (0 * this.width) / 8,
      marginY = (0 * this.height) / 8;

    const p1 = this.viewportToFramedGraph({ x: 0 - marginX, y: 0 - marginY }),
      p2 = this.viewportToFramedGraph({
        x: this.width + marginX,
        y: 0 - marginY,
      }),
      h = this.viewportToFramedGraph({ x: 0, y: this.height + marginY });

    return {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      height: p2.y - h.y,
    };
  }

  /**
   * Method returning the coordinates of a point from the framed graph system to the viewport system. It allows
   * overriding anything that is used to get the translation matrix, or even the matrix itself.
   *
   * Be careful if overriding dimensions, padding or cameraState, as the computation of the matrix is not the lightest
   * of computations.
   */
  framedGraphToViewport(
    coordinates: Coordinates,
    override: CoordinateConversionOverride = {}
  ): Coordinates {
    const recomputeMatrix =
      !!override.cameraState ||
      !!override.viewportDimensions ||
      !!override.graphDimensions;
    const matrix = override.matrix
      ? override.matrix
      : recomputeMatrix
      ? matrixFromCamera(
          override.cameraState || this.camera.getState(),
          override.viewportDimensions || this.getDimensions(),
          override.graphDimensions || this.getGraphDimensions(),
          override.padding || this.getSetting("stagePadding") || 0
        )
      : this.matrix;

    const viewportPos = multiplyVec2(matrix, coordinates);

    return {
      x: ((1 + viewportPos.x) * this.width) / 2,
      y: ((1 - viewportPos.y) * this.height) / 2,
    };
  }

  /**
   * Method returning the coordinates of a point from the viewport system to the framed graph system. It allows
   * overriding anything that is used to get the translation matrix, or even the matrix itself.
   *
   * Be careful if overriding dimensions, padding or cameraState, as the computation of the matrix is not the lightest
   * of computations.
   */
  viewportToFramedGraph(
    coordinates: Coordinates,
    override: CoordinateConversionOverride = {}
  ): Coordinates {
    const recomputeMatrix =
      !!override.cameraState ||
      !!override.viewportDimensions ||
      !override.graphDimensions;
    const invMatrix = override.matrix
      ? override.matrix
      : recomputeMatrix
      ? matrixFromCamera(
          override.cameraState || this.camera.getState(),
          override.viewportDimensions || this.getDimensions(),
          override.graphDimensions || this.getGraphDimensions(),
          override.padding || this.getSetting("stagePadding") || 0,
          true
        )
      : this.invMatrix;

    const res = multiplyVec2(invMatrix, {
      x: (coordinates.x / this.width) * 2 - 1,
      y: 1 - (coordinates.y / this.height) * 2,
    });

    if (isNaN(res.x)) res.x = 0;
    if (isNaN(res.y)) res.y = 0;

    return res;
  }

  /**
   * Method used to translate a point's coordinates from the viewport system (pixel distance from the top-left of the
   * stage) to the graph system (the reference system of data as they are in the given graph instance).
   *
   * This method accepts an optional camera which can be useful if you need to translate coordinates
   * based on a different view than the one being currently being displayed on screen.
   *
   * @param {Coordinates}                  viewportPoint
   * @param {CoordinateConversionOverride} override
   */
  viewportToGraph(
    viewportPoint: Coordinates,
    override: CoordinateConversionOverride = {}
  ): Coordinates {
    return this.normalizationFunction.inverse(
      this.viewportToFramedGraph(viewportPoint, override)
    );
  }

  /**
   * Method used to translate a point's coordinates from the graph system (the reference system of data as they are in
   * the given graph instance) to the viewport system (pixel distance from the top-left of the stage).
   *
   * This method accepts an optional camera which can be useful if you need to translate coordinates
   * based on a different view than the one being currently being displayed on screen.
   *
   * @param {Coordinates}                  graphPoint
   * @param {CoordinateConversionOverride} override
   */
  graphToViewport(
    graphPoint: Coordinates,
    override: CoordinateConversionOverride = {}
  ): Coordinates {
    return this.framedGraphToViewport(
      this.normalizationFunction(graphPoint),
      override
    );
  }

  /**
   * Method returning the graph's bounding box.
   *
   * @return {{ x: Extent, y: Extent }}
   */
  getBBox(): { x: Extent; y: Extent } {
    return graphExtent(this.graph);
  }

  /**
   * Method returning the graph's custom bounding box, if any.
   *
   * @return {{ x: Extent, y: Extent } | null}
   */
  getCustomBBox(): { x: Extent; y: Extent } | null {
    return this.customBBox;
  }

  /**
   * Method used to override the graph's bounding box with a custom one. Give `null` as the argument to stop overriding.
   *
   * @return {Sigma}
   */
  setCustomBBox(customBBox: { x: Extent; y: Extent } | null): this {
    this.customBBox = customBBox;
    this._scheduleRefresh();
    return this;
  }

  /**
   * Method used to shut the container & release event listeners.
   *
   * @return {undefined}
   */
  kill(): void {
    // Emitting "kill" events so that plugins and such can cleanup
    this.emit("kill");

    // Releasing events
    this.removeAllListeners();

    // Releasing camera handlers
    this.camera.removeListener("updated", this.activeListeners.camera);

    // Releasing DOM events & captors
    window.removeEventListener("resize", this.activeListeners.handleResize);

    // Releasing graph handlers
    this.unbindGraphHandlers();

    // Releasing cache & state
    this.nodeDataCache = {};
    this.edgeDataCache = {};
    this.nodesWithForcedLabels = [];
    this.edgesWithForcedLabels = [];

    this.highlightedNodes.clear();

    // Clearing frames
    if (this.renderFrame) {
      cancelFrame(this.renderFrame);
      this.renderFrame = null;
    }

    if (this.renderHighlightedNodesFrame) {
      cancelFrame(this.renderHighlightedNodesFrame);
      this.renderHighlightedNodesFrame = null;
    }

    // Destroying canvases
    const container = this.container;

    while (container.firstChild) container.removeChild(container.firstChild);
  }

  /**
   * Method used to scale the given size according to the camera's ratio, i.e.
   * zooming state.
   *
   * @param  {number} size - The size to scale (node size, edge thickness etc.).
   * @return {number}      - The scaled size.
   */
  scaleSize(size: number): number {
    return size / this.cameraSizeRatio;
  }

  /**
   * Method that returns the collection of all used canvases.
   * At the moment, the instantiated canvases are the following, and in the
   * following order in the DOM:
   * - `edges`
   * - `nodes`
   * - `edgeLabels`
   * - `labels`
   * - `hovers`
   * - `hoverNodes`
   * - `mouse`
   *
   * @return {PlainObject<HTMLCanvasElement>} - The collection of canvases.
   */
  getCanvases(): PlainObject<HTMLCanvasElement> {
    return { ...this.elements };
  }
}
