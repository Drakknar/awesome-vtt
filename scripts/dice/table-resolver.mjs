import { MODULE_ID } from "../constants.mjs";
import { PHYSICAL_DICE_METHOD as DICE_METHOD } from "../../../awesome-vtt-core/scripts/dice.mjs";
import { getSetting } from "../settings.mjs";
import { emitSocket, ID_PATTERN, MAX_SLOTS, MAX_DICE_PER_SLOT } from "./socket.mjs";
import { padContext, parseResult, fillSlot, clearSlots, onPadClick } from "./pad.mjs";

const RollResolver = foundry.applications.dice.RollResolver;

/** Upper bounds for data sent to the GM. */

/**
 * Resolver for physical dice. Core uses it when this module's method is the only interactive fulfillment method
 * configured on a client. The player enters results with a keypad, and/or the request is relayed to the GM.
 * Core then applies the results to the roll, and the system applies modifiers as usual.
 * Manual-method terms keep working, because everything else is inherited from the core resolver.
 */
export default class TableRollResolver extends RollResolver {
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "avtt-roll-resolver"],
    window: { title: "AVTT.Dice.Title", icon: "fa-solid fa-dice" },
    position: { width: 460 },
    actions: {
      avttPad: TableRollResolver.#onPad,
      avttClear: TableRollResolver.#onClear
    }
  };

  static PARTS = {
    form: { id: "form", template: `modules/${MODULE_ID}/templates/roll-resolver.hbs` }
  };

  /** Open resolvers by outstanding GM request id. */
  static #byRequest = new Map();

  /** Outstanding GM requests of this resolver: request id -> term ids it covers. */
  #requests = new Map();

  /** Terms already sent to the GM. */
  #requestedTerms = new Set();

  /** Has the first pass been submitted? Later requests are only for rerolls and explosions. */
  #submitted = false;

  /** Which results of each physical-dice term were entered by hand and which were rolled by Foundry. */
  #origins = new Map();

  #recordOrigin(term, index, entered) {
    if ( !this.#origins.has(term) ) this.#origins.set(term, { physical: new Set(), digital: new Set() });
    const { physical, digital } = this.#origins.get(term);
    (entered ? physical : digital).add(index);
    (entered ? digital : physical).delete(index);
  }

  get #mode() {
    return getSetting("physicalDice");
  }

  /**
   * Is an active GM asked to enter results?
   * @returns {boolean}
   */
  get #relay() {
    return !game.user.isGM && ["gm", "both"].includes(this.#mode) && !!game.users.activeGM;
  }

  /**
   * May the rolling player enter results? Always, unless the GM is the one entering them.
   * @returns {boolean}
   */
  get #playerEntry() {
    return game.user.isGM || this.#mode !== "gm" || !game.users.activeGM;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const entry = this.#playerEntry;
    let physical = false;
    for ( const [id, group] of Object.entries(context.groups) ) {
      const { term, method } = this.fulfillable.get(id) ?? {};
      if ( method !== DICE_METHOD ) continue;
      physical = true;
      for ( const result of group.results ) result.readonly = !entry;
      if ( entry ) group.pad = padContext(term.faces);
    }
    return Object.assign(context, {
      waitingForGM: physical && this.#relay && !entry,
      gmCanEnter: physical && this.#relay && entry
    });
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( !this.#relay || this.#submitted ) return;
    const slots = [];
    for ( const { id, term, method } of this.fulfillable.values() ) {
      if ( (method !== DICE_METHOD) || this.#requestedTerms.has(id) ) continue;
      this.#requestedTerms.add(id);
      const count = Math.max(0, (term.number ?? 1) - term.results.length);
      if ( count ) slots.push({ termId: id, faces: term.faces, count });
    }
    if ( slots.length ) this.#request(slots);
  }

  /** @inheritDoc */
  async resolveResult(term, method, options = {}) {
    const hasGroup = !!this.element?.querySelector(`fieldset[data-term-id="${term._id}"]`);
    // The new result will be pushed at the current end of the term's results.
    const index = term.results.length;
    const promise = super.resolveResult(term, method, options);
    if ( hasGroup && (method === DICE_METHOD) ) {
      // Capture phase runs before core's click handler, which fills an empty input with a random face.
      const fields = [...this.element.querySelectorAll(`fieldset[data-term-id="${term._id}"] .form-fields`)].at(-1);
      fields?.addEventListener("click", event => {
        if ( event.target.closest("button.submit-result") ) {
          this.#recordOrigin(term, index, fields.querySelector("input").value !== "");
        }
      }, { capture: true });
    }
    if ( hasGroup && (method === DICE_METHOD) && this.#relay ) {
      const requestId = this.#request([{ termId: term._id, faces: term.faces, count: 1, extra: true }]);
      promise.then(() => this.#finish([requestId]));
    }
    return promise;
  }

  /** @inheritDoc */
  async _onSubmitForm(formConfig, event) {
    this.#submitted = true;
    this.#finish([...this.#requests.keys()]);
    // Before core fills empty inputs with random faces. Results are appended in input order.
    for ( const { id, term, method } of this.fulfillable.values() ) {
      if ( method !== DICE_METHOD ) continue;
      const start = term.results.length;
      const inputs = [...this.element.querySelectorAll(`input[name="${id}"]:not(:disabled)`)];
      inputs.forEach((input, k) => this.#recordOrigin(term, start + k, input.value !== ""));
    }
    return super._onSubmitForm(formConfig, event);
  }

  /** @inheritDoc */
  async close(options = {}) {
    this.#finish([...this.#requests.keys()]);
    // Core closes the resolver right after evaluation, before the chat message is created.
    this.#prepareForDiceSoNice();
    return super.close(options);
  }

  /**
   * Optional Dice So Nice integration: animate the dice Foundry rolled, not the ones rolled by hand.
   * - A term with any Foundry-rolled result is labelled with core's digital method, so Dice So Nice doesn't treat
   *   the roll as manually entered. Core only lets a term's method be set once, so the label is set on the instance.
   * - When Dice So Nice skips manually entered rolls (its own setting), hand-entered results are marked hidden,
   *   which Dice So Nice doesn't animate. Core and dnd5e don't read this flag.
   */
  #prepareForDiceSoNice() {
    const origins = [...this.#origins];
    this.#origins.clear();
    if ( !getSetting("diceSoNice") || !game.modules.get("dice-so-nice")?.active ) return;
    let skipManual = true;
    try { skipManual = game.settings.get("dice-so-nice", "disabledForManualRolls") !== false; }
    catch { /* Setting missing in this Dice So Nice version: assume its default (on). */ }
    for ( const [term, { physical, digital }] of origins ) {
      if ( digital.size ) Object.defineProperty(term, "method", { value: "mersenne", configurable: true });
      if ( skipManual ) for ( const i of physical ) if ( term.results[i] ) term.results[i].hidden = true;
    }
  }

  /* -------------------------------------------- */
  /*  GM relay                                    */
  /* -------------------------------------------- */

  #request(slots) {
    const requestId = foundry.utils.randomID();
    this.#requests.set(requestId, slots.map(s => s.termId));
    TableRollResolver.#byRequest.set(requestId, this);
    const flavor = this.roll.options?.flavor;
    emitSocket("diceRequest", {
      requestId,
      speaker: this.#speakerName(),
      formula: this.roll.formula,
      flavor: typeof flavor === "string" ? flavor : "",
      slots: slots.slice(0, MAX_SLOTS).map(s => ({ ...s, count: Math.min(s.count, MAX_DICE_PER_SLOT) }))
    });
    return requestId;
  }

  /**
   * Tell the GM that these requests no longer need an answer.
   * @param {string[]} requestIds
   */
  #finish(requestIds) {
    const open = requestIds.filter(id => this.#requests.delete(id));
    if ( !open.length ) return;
    for ( const id of open ) TableRollResolver.#byRequest.delete(id);
    emitSocket("diceDone", { requestIds: open });
  }

  /**
   * Name shown to the GM: the character of the seat that opened this roll, if known.
   * @returns {string}
   */
  #speakerName() {
    const seat = game.modules.get(MODULE_ID).api?.overlay?.recentSeat;
    if ( seat?.actor ) return seat.config.playerName ? `${seat.actor.name} (${seat.config.playerName})` : seat.actor.name;
    return game.user.character?.name ?? game.user.name;
  }

  /**
   * Socket handler: results entered by the GM.
   * @param {object} data
   */
  static receiveResult(data) {
    if ( data.targetUserId !== game.user.id ) return;
    if ( !game.users.get(data.userId)?.isGM ) return;
    if ( !ID_PATTERN.test(data.requestId ?? "") ) return;
    const resolver = TableRollResolver.#byRequest.get(data.requestId);
    resolver?.#applyResults(data.requestId, data.results, data.digital === true);
  }

  #applyResults(requestId, results, digital) {
    const termIds = this.#requests.get(requestId);
    if ( !termIds || !this.element ) return;
    this.#finish([requestId]);
    if ( digital ) return this.#rollDigitally(termIds);
    if ( !results || (typeof results !== "object") ) return;
    for ( const [termId, values] of Object.entries(results) ) {
      const term = this.fulfillable.get(termId)?.term;
      if ( !term || !Array.isArray(values) ) continue;
      for ( const value of values.slice(0, MAX_DICE_PER_SLOT) ) {
        const n = parseResult(value, term.faces);
        if ( n !== null ) fillSlot(this.element, termId, n);
      }
    }
    // The GM confirmed in their own window, so submit once every die has a value.
    const inputs = [...this.element.querySelectorAll("fieldset[data-term-id] input:not(:disabled)")];
    if ( !this.#submitted && inputs.length && inputs.every(i => i.value !== "") ) {
      this.element.requestSubmit(this.element.querySelector('button[type="submit"]'));
    }
  }

  /**
   * The GM chose to let Foundry roll: empty dice get random results, as when the player confirms them empty.
   * @param {string[]} termIds
   */
  #rollDigitally(termIds) {
    if ( !this.#submitted ) {
      this.element.requestSubmit(this.element.querySelector('button[type="submit"]'));
      return;
    }
    // Rerolls and extra dice after the first pass: an empty input confirmed with its button is rolled by Foundry.
    for ( const termId of termIds ) {
      const fieldset = this.element.querySelector(`fieldset[data-term-id="${CSS.escape(termId)}"]`);
      const pending = [...(fieldset?.querySelectorAll(".form-fields") ?? [])]
        .find(f => f.querySelector("input:not(:disabled)")?.value === "");
      pending?.querySelector("button.submit-result")?.dispatchEvent(new MouseEvent("click"));
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onPad(event, target) {
    onPadClick(this.element, target);
  }

  static #onClear() {
    clearSlots(this.element);
  }
}
