import { MODULE_ID, SEATS, DEFAULT_COLORS } from "./constants.mjs";
import { syncOwnership } from "./ownership.mjs";

/**
 * Players choose their character's seat (the "Table seat" options window, the phone's Settings tab; the table user
 * from a seat's gear). Seats are a world setting, which only a GM may write, so a player's choice is sent to the
 * active GM, whose client checks and saves it. A taken seat is swapped. A character that isn't seated yet may only
 * take a free seat (taking a taken one would remove the other character from the table).
 */

const CHANNEL = `module.${MODULE_ID}`;
const SEAT_KEYS = new Set(SEATS.map(s => s.key));

const savedSeats = () => game.settings.get(MODULE_ID, "seats") ?? {};

/** The seat key a character sits in, or null. */
export function seatOf(actor, seats = savedSeats()) {
  return Object.keys(seats).find(key => actor && (seats[key]?.actorId === actor.id)) ?? null;
}

/** Characters whose seat this user may choose: player characters they own. */
export const movableActors = (user = game.user) =>
  game.actors.filter(a => (a.type === "character") && a.testUserPermission(user, "OWNER"))
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * The 12 seats as choices for a character.
 * @param {Actor} actor
 * @returns {{key: string, label: string, occupant: string, current: boolean, disabled: boolean}[]}
 */
export function seatOptions(actor) {
  const seats = savedSeats();
  const seated = !!seatOf(actor, seats);
  return SEATS.map(({ key }) => {
    const other = seats[key]?.actorId ? game.actors.get(seats[key].actorId) : null;
    const current = !!other && (other === actor);
    return {
      key,
      label: game.i18n.localize(`AVTT.Seat.${key}`),
      occupant: (other && !current) ? other.name : "",
      current,
      disabled: !seated && !!other
    };
  });
}

/**
 * Move a character to a seat (swapping with whoever sits there). Sent to the active GM unless this user is one.
 * @returns {Promise<boolean>}  Whether the move was saved or sent.
 */
export async function moveSeat(actor, seatKey) {
  if ( !actor || !SEAT_KEYS.has(seatKey) || !actor.isOwner ) return false;
  if ( game.user.isGM ) return applyMove(game.user, actor, seatKey);
  if ( !game.users.activeGM ) {
    ui.notifications.warn("AVTT.SeatMove.NoGM", { localize: true });
    return false;
  }
  game.socket.emit(CHANNEL, { type: "moveSeat", actorId: actor.id, seatKey });
  return true;
}

/** Listen for players' seat choices. Every client calls this; only the active GM acts. */
export function activateSeatSocket() {
  game.socket.on(CHANNEL, (data, senderId) => {
    if ( (data?.type !== "moveSeat") || !game.users.activeGM?.isSelf ) return;
    const user = game.users.get(senderId);
    const actor = game.actors.get(data.actorId);
    if ( !user || !actor || (typeof data.seatKey !== "string") ) return;
    applyMove(user, actor, data.seatKey);
  });
}

/** GM: check and save a move on behalf of a user. */
async function applyMove(user, actor, seatKey) {
  if ( !SEAT_KEYS.has(seatKey) || (actor.type !== "character") || !actor.testUserPermission(user, "OWNER") ) return false;
  const seats = foundry.utils.deepClone(savedSeats());
  const from = seatOf(actor, seats);
  if ( from === seatKey ) return true;
  const there = seats[seatKey]?.actorId ? seats[seatKey] : null;
  if ( from ) {
    seats[seatKey] = seats[from];
    if ( there ) seats[from] = there;
    else delete seats[from];
  } else {
    if ( there ) return false;
    const tableUser = game.settings.get(MODULE_ID, "tableUser");
    const index = SEATS.findIndex(s => s.key === seatKey);
    seats[seatKey] = {
      actorId: actor.id,
      // The table account's name says nothing about who sits there; a player's own name does.
      playerName: (user.id === tableUser) ? "" : user.name.slice(0, 64),
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    };
  }
  await game.settings.set(MODULE_ID, "seats", seats);
  // A newly seated character must be owned by the table user.
  if ( !from ) await syncOwnership(game.settings.get(MODULE_ID, "tableUser"), seats);
  return true;
}
