import { MODULE_ID } from "./constants.mjs";
import sys from "../../awesome-vtt-core/scripts/system.mjs";

const { OWNER, INHERIT } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

/**
 * Give the table user Owner permission on every seated actor, and revoke it from actors that are no longer seated.
 * Only permissions this module granted are revoked; the previous level is restored. A seated character's transformed
 * form counts as seated (it may carry a copy of the character's grant flag).
 * Must run on a GM client.
 * @param {string} tableUserId
 * @param {Record<string, {actorId: string}>} seats
 */
export async function syncOwnership(tableUserId, seats) {
  if ( !game.user.isGM ) return;
  const seated = new Set(Object.values(seats).map(s => s.actorId).filter(Boolean));

  for ( const actor of game.actors ) {
    const grant = actor.getFlag(MODULE_ID, "grant");
    const shouldOwn = !!tableUserId && seated.has(sys.originalId(actor));

    // Revoke a grant that is stale (actor unseated, or the table user changed).
    if ( grant && (!shouldOwn || grant.userId !== tableUserId) ) {
      await actor.update({ [`ownership.${grant.userId}`]: grant.previous ?? INHERIT });
      await actor.unsetFlag(MODULE_ID, "grant");
    }

    if ( shouldOwn && (actor.ownership[tableUserId] ?? INHERIT) < OWNER ) {
      await actor.update({
        [`ownership.${tableUserId}`]: OWNER,
        [`flags.${MODULE_ID}.grant`]: { userId: tableUserId, previous: actor.ownership[tableUserId] ?? null }
      });
    }
  }
}
