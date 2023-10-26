/**
 * Sigma.js Settings
 * =================================
 *
 * The list of settings and some handy functions.
 * @module
 */
import { Attributes } from "graphology-types";

import { assign } from "./utils";
import { EdgeDisplayData, NodeDisplayData } from "./types";
import CircleNodeProgram from "./rendering/webgl/programs/node.fast";
import { NodeProgramConstructor } from "./rendering/webgl/programs/common/node";

/**
 * Sigma.js settings
 * =================================
 */
export interface Settings {
  // Performance
  hideEdgesOnMove: boolean;
  hideLabelsOnMove: boolean;
  renderLabels: boolean;
  renderEdgeLabels: boolean;
  enableEdgeClickEvents: boolean;
  enableEdgeWheelEvents: boolean;
  enableEdgeHoverEvents: boolean | "debounce";
  // Component rendering
  defaultNodeColor: string;
  defaultNodeType: string;
  defaultEdgeColor: string;
  defaultEdgeType: string;
  labelFont: string;
  labelSize: number;
  labelWeight: string;
  labelColor:
    | { attribute: string; color?: string }
    | { color: string; attribute?: undefined };
  edgeLabelFont: string;
  edgeLabelSize: number;
  edgeLabelWeight: string;
  edgeLabelColor:
    | { attribute: string; color?: string }
    | { color: string; attribute?: undefined };
  stagePadding: number;
  // Labels
  labelDensity: number;
  labelGridCellSize: number;
  labelRenderedSizeThreshold: number;
  // Reducers
  nodeReducer:
    | null
    | ((node: string, data: Attributes) => Partial<NodeDisplayData>);
  edgeReducer:
    | null
    | ((edge: string, data: Attributes) => Partial<EdgeDisplayData>);
  // Features
  zIndex: boolean;
  minCameraRatio: null | number;
  maxCameraRatio: null | number;

  // Lifecycle
  allowInvalidContainer: boolean;

  // Program classes
  nodeProgramClasses: { [type: string]: NodeProgramConstructor };
  nodeHoverProgramClasses: { [type: string]: NodeProgramConstructor };
}

export const DEFAULT_SETTINGS: Settings = {
  // Performance
  hideEdgesOnMove: false,
  hideLabelsOnMove: false,
  renderLabels: true,
  renderEdgeLabels: false,
  enableEdgeClickEvents: false,
  enableEdgeWheelEvents: false,
  enableEdgeHoverEvents: false,

  // Component rendering
  defaultNodeColor: "#999",
  defaultNodeType: "circle",
  defaultEdgeColor: "#ccc",
  defaultEdgeType: "line",
  labelFont: "Arial",
  labelSize: 14,
  labelWeight: "normal",
  labelColor: { color: "#000" },
  edgeLabelFont: "Arial",
  edgeLabelSize: 14,
  edgeLabelWeight: "normal",
  edgeLabelColor: { attribute: "color" },
  stagePadding: 30,

  // Labels
  labelDensity: 1,
  labelGridCellSize: 100,
  labelRenderedSizeThreshold: 6,

  // Reducers
  nodeReducer: null,
  edgeReducer: null,

  // Features
  zIndex: false,
  minCameraRatio: null,
  maxCameraRatio: null,

  // Lifecycle
  allowInvalidContainer: false,

  // Program classes
  nodeProgramClasses: {},
  nodeHoverProgramClasses: {},
};

export const DEFAULT_NODE_PROGRAM_CLASSES = {
  circle: CircleNodeProgram,
};

export function validateSettings(settings: Settings): void {
  if (typeof settings.labelDensity !== "number" || settings.labelDensity < 0) {
    throw new Error(
      "Settings: invalid `labelDensity`. Expecting a positive number."
    );
  }

  const { minCameraRatio, maxCameraRatio } = settings;
  if (
    typeof minCameraRatio === "number" &&
    typeof maxCameraRatio === "number" &&
    maxCameraRatio < minCameraRatio
  ) {
    throw new Error(
      "Settings: invalid camera ratio boundaries. Expecting `maxCameraRatio` to be greater than `minCameraRatio`."
    );
  }
}

export function resolveSettings(settings: Partial<Settings>): Settings {
  const resolvedSettings = assign({}, DEFAULT_SETTINGS, settings);

  resolvedSettings.nodeProgramClasses = assign(
    {},
    DEFAULT_NODE_PROGRAM_CLASSES,
    resolvedSettings.nodeProgramClasses
  );

  return resolvedSettings;
}
