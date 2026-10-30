import { MODULE_ID } from "../constants.mjs";
import { emitSocket } from "./socket.mjs";
import { padContext, parseResult, clearSlots, onPadClick } from "./pad.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-side window for entering the physical dice results of a roll made at the table.
 * One window per request; it closes when the results are sent or when the table no longer needs them.
 */
export default class GmDiceEntry extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "avtt-gm-dice"],
    tag: "form",
    window: { title: "AVTT.Dice.GMTitle", icon: "fa-solid fa-dice" },
    position: { width: 460, height: "auto" },
    form: { handler: GmDiceEntry.#onSubmit, closeOnSubmit: false },
    actions: {
      avttPad: GmDiceEntry.#onPad,
      avttClear: GmDiceEntry.#onClear,
      avttDigital: GmDiceEntry.#onDigital
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/gm-dice-entry.hbs` },
    footer: { template: `modules/${MODULE_ID}/templates/gm-dice-footer.hbs` }
  };

  /** Open windows by request id. */
  static #open = new Map();

  /**
   * @param {object} request                Sanitized request (see fulfillment.mjs).
   * @param {string} request.requestId
   * @param {User} request.user             The user who is rolling.
   * @param {string} request.speaker
   * @param {string} request.formula
   * @param {string} request.flavor
   * @param {{termId: string, faces: number, count: number, extra: boolean}[]} request.slots
   * @param {object} options
   */
  constructor(request, options = {}) {
    super({ ...options, id: `${MODULE_ID}-gm-dice-${request.requestId}` });
    this.request = request;
    GmDiceEntry.#open.set(request.requestId, this);
  }

  /**
   * Socket handler: the table no longer needs these results (entered there, or the roll finished).
   * @param {object} data
   */
  static closeRequests(data) {
    if ( !Array.isArray(data.requestIds) ) return;
    for ( const id of data.requestIds.slice(0, 50) ) {
      const app = GmDiceEntry.#open.get(id);
      if ( app && (app.request.user.id === data.userId) ) app.close();
    }
  }

  /** @override */
  async _prepareContext(options) {
    const { user, speaker, formula, flavor, slots } = this.request;
    return {
      user: user.name,
      speaker,
      formula,
      flavor,
      slots: slots.map(s => ({
        ...s,
        label: `${s.count}d${s.faces}`,
        inputs: Array.from({ length: s.count }),
        pad: padContext(s.faces)
      }))
    };
  }

  /** @inheritDoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.bringToFront?.();
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
    GmDiceEntry.#open.delete(this.request.requestId);
  }

  static #onPad(event, target) {
    onPadClick(this.element, target);
  }

  static #onClear() {
    clearSlots(this.element);
  }

  /** Let Foundry roll these dice on the player's client instead of entering results. */
  static async #onDigital() {
    emitSocket("diceResult", { requestId: this.request.requestId, targetUserId: this.request.user.id, digital: true });
    await this.close();
  }

  static async #onSubmit(event, form) {
    const results = {};
    for ( const slot of this.request.slots ) {
      const fieldset = form.querySelector(`fieldset[data-term-id="${CSS.escape(slot.termId)}"]`);
      const values = [...(fieldset?.querySelectorAll("input") ?? [])].map(i => parseResult(i.value, slot.faces));
      if ( (values.length !== slot.count) || values.includes(null) ) {
        ui.notifications.warn("AVTT.Dice.Incomplete", { localize: true });
        return;
      }
      results[slot.termId] = values;
    }
    emitSocket("diceResult", { requestId: this.request.requestId, targetUserId: this.request.user.id, results });
    await this.close();
  }
}
