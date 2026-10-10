/**
 * A number pad for the number fields in a seat (HP amount, coins, …), for players with only the shared mouse.
 * It opens as a panel of its own, beside the seat's open panels (user's choice), when a field gets focus, titled with
 * the field's name, and closes when the field loses focus, or with OK. Digits replace
 * the value on the first press and then add to it; − and + step by one, and repeat faster while held.
 * The pad keeps the focus in the field (its buttons don't take it), so typing on a keyboard still works too.
 * Changes are reported like typing: "input" on each press, and "change" once when the pad closes.
 */

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 100;
const FAST_REPEAT_MS = 40;
const FAST_AFTER = 10;

export default class Keypad {
  /**
   * @param {HTMLElement} root  The seat element.
   * @param {Record<string, string>} labels  Localized labels: pad, clear, back, less, more, done.
   */
  constructor(root, labels) {
    this.root = root;
    this.labels = labels;
    root.addEventListener("focusin", this.#onFocusIn.bind(this));
    root.addEventListener("focusout", this.#onFocusOut.bind(this));
  }

  /** @type {HTMLInputElement|null} */
  input = null;
  /** @type {HTMLElement|null} */
  element = null;
  #initial = "";
  #fresh = true;
  #hold = null;

  #onFocusIn(event) {
    const input = event.target;
    if ( !(input instanceof HTMLInputElement) || (input.type !== "number") || input.disabled || input.readOnly ) return;
    if ( input === this.input && this.element?.isConnected ) return;
    this.close();
    this.input = input;
    this.#initial = input.value;
    this.#fresh = true;
    this.element = this.#build(this.#fieldName(input));
    this.root.querySelector(".avtt-drawers")?.append(this.element);
  }

  #onFocusOut(event) {
    if ( event.target !== this.input ) return;
    // Focus moving into the pad never happens (its buttons don't take focus), so this is the field being left.
    this.close();
  }

  /** Close the pad; report the change if the value differs from when it opened. */
  close() {
    this.#stopHold();
    const input = this.input;
    this.element?.remove();
    this.element = this.input = null;
    if ( input?.isConnected && (input.value !== this.#initial) ) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  /** The field's name, for the pad's title: its label, else its aria-label, else the pad's own name. */
  #fieldName(input) {
    const label = input.closest("label")?.textContent.trim() || input.getAttribute("aria-label");
    return label || this.labels.pad;
  }

  #build(title) {
    const l = this.labels;
    const el = document.createElement("div");
    el.className = "avtt-panel avtt-keypad";
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", `${l.pad}: ${title}`);
    const key = (k, text, label = text, cls = "") =>
      `<button type="button" data-key="${k}" class="${cls}" ${label !== text ? `aria-label="${label}" data-tooltip=""` : ""}>${text}</button>`;
    el.innerHTML = `
      <header class="avtt-keypad-title"><i class="fa-solid fa-calculator" inert></i> <span></span></header>
      <div class="avtt-keypad-steps">
        ${key("less", "−", l.less, "avtt-keypad-hold")}
        ${key("more", "+", l.more, "avtt-keypad-hold")}
      </div>
      <div class="avtt-keypad-digits">
        ${["7", "8", "9", "4", "5", "6", "1", "2", "3"].map(d => key(d, d)).join("")}
        ${key("clear", "C", l.clear)}
        ${key("0", "0")}
        ${key("back", '<i class="fa-solid fa-delete-left" inert></i>', l.back)}
      </div>
      ${key("done", `<i class="fa-solid fa-check" inert></i> ${l.done}`, `${l.done}`, "avtt-keypad-done")}`;
    el.querySelector(".avtt-keypad-title span").textContent = title;
    // Pressing a pad button must not take the focus from the field (that would close the pad).
    el.addEventListener("pointerdown", event => {
      event.preventDefault();
      const button = event.target.closest("button[data-key]");
      if ( button?.classList.contains("avtt-keypad-hold") && (event.button === 0) ) this.#startHold(button.dataset.key);
    });
    el.addEventListener("mousedown", event => event.preventDefault());
    for ( const type of ["pointerup", "pointerleave", "pointercancel"] ) el.addEventListener(type, () => this.#stopHold());
    el.addEventListener("click", event => {
      event.stopPropagation();
      const button = event.target.closest("button[data-key]");
      // Held buttons act on pointerdown; a click from the keyboard (detail 0) still steps once.
      if ( !button || (button.classList.contains("avtt-keypad-hold") && (event.detail !== 0)) ) return;
      this.#press(button.dataset.key);
    });
    return el;
  }

  #press(k) {
    const input = this.input;
    if ( !input?.isConnected ) return this.close();
    if ( k === "done" ) {
      this.close();
      input.blur();
      return;
    }
    let value = input.value;
    if ( /^\d$/.test(k) ) value = (this.#fresh || (value === "0")) ? k : value + k;
    else if ( k === "back" ) value = value.slice(0, -1);
    else if ( k === "clear" ) value = "";
    else if ( (k === "less") || (k === "more") ) value = String((Number(value) || 0) + ((k === "more") ? 1 : -1));
    this.#fresh = false;
    this.#set(value);
  }

  /** Put a value in the field, kept within its min and max. */
  #set(value) {
    const input = this.input;
    if ( value !== "" ) {
      let n = Number(value);
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      if ( Number.isFinite(n) ) n = Math.clamp(n, min, max);
      value = String(n);
    }
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  #startHold(k) {
    this.#stopHold();
    this.#press(k);
    let count = 0;
    const repeat = () => {
      this.#press(k);
      count++;
      this.#hold = window.setTimeout(repeat, count >= FAST_AFTER ? FAST_REPEAT_MS : REPEAT_MS);
    };
    this.#hold = window.setTimeout(repeat, HOLD_DELAY_MS);
  }

  #stopHold() {
    window.clearTimeout(this.#hold);
    this.#hold = null;
  }
}
