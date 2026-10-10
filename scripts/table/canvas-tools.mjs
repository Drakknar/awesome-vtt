/**
 * Map tools for the pills: Select, Hand (pan), Target, Ruler, zoom and reset zoom.
 * - Select, Target and Ruler are core's token tools ("select", "target", "ruler"), switched through the SceneControls application, so
 *   they work while the toolbar is hidden.
 * - Foundry v14 has no hand tool (core pans with right-drag or Ctrl + arrow keys), so Hand mode is this module's:
 *   while it's on, a left-drag on the map pans it, like core's right-drag, and doesn't select or move tokens.
 */

let handMode = false;
let drag = null;
const listeners = new Set();

/** Called whenever the active map tool may have changed, so pills can update their buttons. */
export const onToolChange = fn => listeners.add(fn);
const changed = () => listeners.forEach(fn => fn());

const tokenTool = () => (ui.controls?.control?.name === "tokens") ? ui.controls?.tool?.name : null;

/** @returns {"select"|"target"|"hand"|"ruler"|null} */
export function currentTool() {
  const tool = tokenTool();
  if ( (tool === "ruler") || (tool === "target") ) return tool;
  if ( tool === "select" ) return handMode ? "hand" : "select";
  return null;
}

/** Look up a token tool by key (with a fallback search), or null. */
function findTool(key, pattern) {
  const tools = ui.controls?.controls?.tokens?.tools ?? {};
  if ( key in tools ) return key;
  return Object.keys(tools).find(k => pattern.test(k)) ?? null;
}

/**
 * Switch the map tool.
 * @param {"select"|"target"|"hand"|"ruler"} tool
 * @returns {Promise<string|null>}  The tool active afterwards.
 */
export async function setTool(tool) {
  const key = (tool === "ruler") ? findTool("ruler", /ruler|measure/i)
    : (tool === "target") ? findTool("target", /target/i)
      : findTool("select", /select/i);
  if ( !key ) {
    if ( tool === "ruler" ) ui.notifications.info("AVTT.Pill.RulerHint", { localize: true });
    return currentTool();
  }
  handMode = tool === "hand";
  document.body.classList.toggle("avtt-hand-mode", handMode);
  await ui.controls.activate({ control: "tokens", tool: key });
  changed();
  return currentTool();
}

/** The Ruler and Target buttons toggle between their tool and the Select tool. */
export const toggleTool = tool => setTool((tokenTool() === tool) ? "select" : tool);

/** Zoom factor per button press. */
const ZOOM_STEP = 1.25;

/**
 * Zoom the map in (+1) or out (-1) around the current view centre.
 * Core clamps the result to the scene's zoom limits.
 */
export function zoom(direction) {
  if ( !canvas?.ready ) return;
  const factor = direction > 0 ? ZOOM_STEP : (1 / ZOOM_STEP);
  return canvas.animatePan({ scale: canvas.stage.scale.x * factor, duration: 150 });
}

/**
 * Zoom back to 100% (one scene pixel per screen pixel) around the current view centre. Core has no reset-zoom
 * control of its own; this uses the same core call as the zoom buttons, which keeps it within the scene's limits.
 */
export function resetZoom() {
  if ( !canvas?.ready ) return;
  return canvas.animatePan({ scale: 1, duration: 150 });
}

/* -------------------------------------------- */
/*  Hand mode: left-drag pans the map           */
/* -------------------------------------------- */

const isBoard = target => target?.id === "board";

/*
 * The drag pans to (start view) − (pointer travel since the start), so a lost or repeated event can't add up to
 * drift. Only real pointer events count: core's canvas.pan() dispatches a synthetic "pointermove" carrying the last
 * position the map itself saw (from before this drag, since the drag's events are kept from the map), and taking
 * that one as a move panned the map back and forth, and back to where it started (first seen on Firefox).
 * Panning is applied once per animation frame, with the latest pointer position.
 */
function onPointerDown(event) {
  if ( !handMode || (event.button !== 0) || !event.isTrusted || !isBoard(event.target) || !canvas?.ready ) return;
  // The R key or the toolbar may have switched to another tool: hand mode ends with it.
  if ( tokenTool() !== "select" ) {
    handMode = false;
    document.body.classList.remove("avtt-hand-mode");
    changed();
    return;
  }
  // Registered on window in the capture phase, so this runs before the map's own pointer handling.
  event.stopPropagation();
  event.preventDefault();
  drag = {
    id: event.pointerId,
    startX: event.clientX, startY: event.clientY,
    x: event.clientX, y: event.clientY,
    pivot: { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y },
    frame: null
  };
  document.body.classList.add("avtt-panning");
}

function onPointerMove(event) {
  if ( !drag || !event.isTrusted || (event.pointerId !== drag.id) ) return;
  event.stopPropagation();
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.frame ??= requestAnimationFrame(applyDrag);
}

function applyDrag() {
  if ( !drag ) return;
  drag.frame = null;
  const scale = canvas.stage.scale.x;
  canvas.pan({
    x: drag.pivot.x - ((drag.x - drag.startX) / scale),
    y: drag.pivot.y - ((drag.y - drag.startY) / scale)
  });
}

function onPointerUp(event) {
  if ( !drag || !event.isTrusted || (event.pointerId !== drag.id) ) return;
  event.stopPropagation();
  if ( drag.frame ) cancelAnimationFrame(drag.frame);
  // The last position, in case its frame hadn't run yet (a cancelled pointer may carry no position).
  if ( event.type === "pointerup" ) {
    drag.x = event.clientX;
    drag.y = event.clientY;
  }
  applyDrag();
  drag = null;
  document.body.classList.remove("avtt-panning");
}

/** Start listening; call once on the table client. */
export function activateHandMode() {
  window.addEventListener("pointerdown", onPointerDown, { capture: true });
  window.addEventListener("pointermove", onPointerMove, { capture: true });
  window.addEventListener("pointerup", onPointerUp, { capture: true });
  window.addEventListener("pointercancel", onPointerUp, { capture: true });
}
