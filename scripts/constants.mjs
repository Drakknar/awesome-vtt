export const MODULE_ID = "awesome-vtt";

/**
 * Seat definitions, relative to the screen's default (OS) orientation.
 * `rotation` turns the seat's UI so that "down" points toward the player sitting at that edge.
 * `along` is the anchor's position along its edge (0 = start, 1 = end), measured in screen coordinates.
 */
const SIDES = {
  bottom: { rotation: 0, positions: ["left", "center", "right"] },
  top: { rotation: 180, positions: ["left", "center", "right"] },
  left: { rotation: 90, positions: ["top", "center", "bottom"] },
  right: { rotation: -90, positions: ["top", "center", "bottom"] }
};
const ALONG = [1 / 6, 1 / 2, 5 / 6];

export const SEATS = Object.entries(SIDES).flatMap(([side, { rotation, positions }]) =>
  positions.map((position, i) => ({ key: `${side}-${position}`, side, rotation, along: ALONG[i] }))
);

/** Default seat colors, cycled when a seat has no explicit color. */
export const DEFAULT_COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
  "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080", "#e6beff"
];

/** How long after a seat interaction a newly rendered window is considered to belong to that seat (ms). */
export const WINDOW_ADOPT_MS = 2000;
