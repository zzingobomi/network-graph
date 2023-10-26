/**
 * Sigma.js Camera Class
 * ======================
 *
 * Class designed to store camera information & used to update it.
 * @module
 */
import { cancelFrame, requestFrame } from "../utils";
import { CameraState, TypedEventEmitter } from "../types";

/**
 * Defaults.
 */
const DEFAULT_ZOOMING_RATIO = 1.5;

/**
 * Event types.
 */
export type CameraEvents = {
  updated(state: CameraState): void;
};

/**
 * Camera class
 *
 * @constructor
 */
export default class Camera
  extends TypedEventEmitter<CameraEvents>
  implements CameraState
{
  x = 0.5;
  y = 0.5;
  angle = 0;
  ratio = 1;

  minRatio: number | null = null;
  maxRatio: number | null = null;

  private nextFrame: number | null = null;
  private previousState: CameraState | null = null;
  private enabled = true;

  animationCallback?: () => void;

  constructor() {
    super();

    // State
    this.previousState = this.getState();
  }

  /**
   * Static method used to create a Camera object with a given state.
   *
   * @param state
   * @return {Camera}
   */
  static from(state: CameraState): Camera {
    const camera = new Camera();
    return camera.setState(state);
  }

  /**
   * Method used to enable the camera.
   *
   * @return {Camera}
   */
  enable(): this {
    this.enabled = true;
    return this;
  }

  /**
   * Method used to disable the camera.
   *
   * @return {Camera}
   */
  disable(): this {
    this.enabled = false;
    return this;
  }

  /**
   * Method used to retrieve the camera's current state.
   *
   * @return {object}
   */
  getState(): CameraState {
    return {
      x: this.x,
      y: this.y,
      angle: this.angle,
      ratio: this.ratio,
    };
  }

  /**
   * Method used to check whether the camera has the given state.
   *
   * @return {object}
   */
  hasState(state: CameraState): boolean {
    return (
      this.x === state.x &&
      this.y === state.y &&
      this.ratio === state.ratio &&
      this.angle === state.angle
    );
  }

  /**
   * Method used to retrieve the camera's previous state.
   *
   * @return {object}
   */
  getPreviousState(): CameraState | null {
    const state = this.previousState;

    if (!state) return null;

    return {
      x: state.x,
      y: state.y,
      angle: state.angle,
      ratio: state.ratio,
    };
  }

  /**
   * Method used to check minRatio and maxRatio values.
   *
   * @param ratio
   * @return {number}
   */
  getBoundedRatio(ratio: number): number {
    let r = ratio;
    if (typeof this.minRatio === "number") r = Math.max(r, this.minRatio);
    if (typeof this.maxRatio === "number") r = Math.min(r, this.maxRatio);
    return r;
  }

  /**
   * Method used to check various things to return a legit state candidate.
   *
   * @param state
   * @return {object}
   */
  validateState(state: Partial<CameraState>): Partial<CameraState> {
    const validatedState: Partial<CameraState> = {};
    if (typeof state.x === "number") validatedState.x = state.x;
    if (typeof state.y === "number") validatedState.y = state.y;
    if (typeof state.angle === "number") validatedState.angle = state.angle;
    if (typeof state.ratio === "number")
      validatedState.ratio = this.getBoundedRatio(state.ratio);
    return validatedState;
  }

  /**
   * Method used to check whether the camera is currently being animated.
   *
   * @return {boolean}
   */
  isAnimated(): boolean {
    return !!this.nextFrame;
  }

  /**
   * Method used to set the camera's state.
   *
   * @param  {object} state - New state.
   * @return {Camera}
   */
  setState(state: Partial<CameraState>): this {
    if (!this.enabled) return this;

    // TODO: update by function

    // Keeping track of last state
    this.previousState = this.getState();

    const validState = this.validateState(state);
    if (typeof validState.x === "number") this.x = validState.x;
    if (typeof validState.y === "number") this.y = validState.y;
    if (typeof validState.angle === "number") this.angle = validState.angle;
    if (typeof validState.ratio === "number") this.ratio = validState.ratio;

    // Emitting
    if (!this.hasState(this.previousState))
      this.emit("updated", this.getState());

    return this;
  }

  /**
   * Method used to update the camera's state using a function.
   *
   * @param  {function} updater - Updated function taking current state and
   *                              returning next state.
   * @return {Camera}
   */
  updateState(updater: (state: CameraState) => Partial<CameraState>): this {
    this.setState(updater(this.getState()));
    return this;
  }

  /**
   * Returns a new Camera instance, with the same state as the current camera.
   *
   * @return {Camera}
   */
  copy(): Camera {
    return Camera.from(this.getState());
  }
}
