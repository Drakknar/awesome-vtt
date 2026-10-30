import { getSetting } from "../settings.mjs";

/**
 * Seated characters on the table's map (the one Table user owns them all):
 * - Their tokens are always shown. Core shows a token only where a vision source sees it, so a character standing far
 *   from the others, or without vision of its own, disappeared, e.g. when another one was selected.
 * - Each one's vision always counts, as with no token selected. Core uses only the selected tokens' vision when one
 *   is selected, which hid what the other players' characters can see; everyone at the table looks at one screen.
 * Hidden tokens (by the GM) stay hidden, and tokens on another level of the scene keep core's rules.
 * Core's getters are wrapped on the configured Token class; on other clients nothing changes.
 */

/** Actor ids of the seated characters; null while the table isn't set up on this client. */
let seated = null;

const isSeated = token => !!seated && !!token.actor && seated.has(token.actor.id);

/** Read the seats again (after they change) and refresh the map's vision. */
export function refreshSeatedTokens() {
  seated = new Set(Object.values(getSetting("seats") ?? {}).map(s => s?.actorId).filter(Boolean));
  if ( !canvas?.ready ) return;
  for ( const token of canvas.tokens.placeables ) token.initializeVisionSource?.();
  canvas.perception.update({ initializeVision: true, refreshVision: true, refreshOcclusion: true });
}

/**
 * Wrap a getter or method of the Token class, keeping core's own as the fallback.
 * @param {Function} Token
 * @param {string} name
 * @param {"get"|"value"} kind
 * @param {Function} fn
 */
function wrap(Token, name, kind, fn) {
  let proto = Token.prototype;
  let descriptor;
  while ( proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, name)) ) proto = Object.getPrototypeOf(proto);
  const original = descriptor?.[kind];
  if ( typeof original !== "function" ) {
    console.warn(`awesome-vtt | Token#${name} not found; seated characters follow core's visibility.`);
    return;
  }
  Object.defineProperty(Token.prototype, name, {
    ...descriptor,
    [kind]: function(...args) { return fn.call(this, original, ...args); }
  });
}

/** Install on the table client, before the map is drawn ("setup" or earlier). */
export function installSeatedVisibility() {
  const Token = CONFIG.Token.objectClass;
  wrap(Token, "isVisible", "get", function(original) {
    const visible = original.call(this);
    if ( visible || !isSeated(this) || this.document.hidden || this.isPreview ) return visible;
    if ( this.document.level !== canvas.level?.id ) return visible;
    return true;
  });
  wrap(Token, "_isVisionSource", "value", function(original) {
    if ( original.call(this) ) return true;
    if ( !isSeated(this) || !canvas.visibility.tokenVision || !this.hasSight || this.document.hidden ) return false;
    return this.document.level === canvas.level?.id;
  });
}
