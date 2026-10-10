import { MODULE_ID } from "../constants.mjs";

export const CHANNEL = `module.${MODULE_ID}`;

/** Limits of a dice request (terms, and dice per term), checked on both sides of the GM relay. */
export const MAX_SLOTS = 20;
export const MAX_DICE_PER_SLOT = 50;

/** Ids produced by foundry.utils.randomID. */
export const ID_PATTERN = /^[A-Za-z0-9]{16}$/;

/** Broadcast a message to the other clients. The sender id is included so receivers can check who it came from. */
export function emitSocket(type, payload = {}) {
  game.socket.emit(CHANNEL, { ...payload, type, userId: game.user.id });
}
