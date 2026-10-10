import { MODULE_ID } from "../constants.mjs";
import { movableActors, seatOptions, moveSeat } from "../seat-moves.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * "Table seat" in the options, for every user: choose the seat of each character you own. A choice is saved at once
 * (through the GM for players); a taken seat is swapped. On the table screen it opens from a seat's settings and is
 * turned toward that seat like other windows opened there.
 */
export default class SeatPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-seat-picker`,
    classes: [MODULE_ID, "avtt-seat-picker"],
    window: { title: "AVTT.SeatMove.Title", icon: "fa-solid fa-chair" },
    position: { width: 420, height: "auto" }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/seat-picker.hbs` }
  };

  /** Id of the hook that re-renders this window when the seats change. */
  #seatsHook = null;

  /** @override */
  async _prepareContext(options) {
    return {
      characters: movableActors().map(actor => {
        const seats = seatOptions(actor);
        return { id: actor.id, name: actor.name, img: actor.img, seats, seated: seats.some(s => s.current) };
      })
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", event => this.#onChange(event));
    this.#seatsHook = Hooks.on(`${MODULE_ID}.seatsChanged`, () => this.render());
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    Hooks.off(`${MODULE_ID}.seatsChanged`, this.#seatsHook);
  }

  async #onChange(event) {
    const select = event.target.closest("select[data-actor-id]");
    const actor = game.actors.get(select?.dataset.actorId);
    if ( !actor || !select.value ) return;
    // A saved move re-renders this window (seatsChanged); one that wasn't made shows the seats as they are.
    if ( !(await moveSeat(actor, select.value)) ) this.render();
  }
}
