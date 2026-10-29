import { MODULE_ID } from "../constants.mjs";

/** Path of the keypad partial; Foundry registers loaded templates as partials under their path. */
export const PAD_TEMPLATE = `modules/${MODULE_ID}/templates/dice-pad.hbs`;

/** Dice with more faces than this get no face buttons (except d100, which gets a tens/units pad). */
const MAX_FACE_BUTTONS = 20;

/**
 * Keypad context for a die with the given number of faces, or null when the value must be typed.
 * @param {number} faces
 * @returns {object|null}
 */
export function padContext(faces) {
  if ( faces === 100 ) {
    const digits = [...Array(10).keys()];
    return {
      percentile: true,
      tens: digits.map(d => ({ value: d * 10, label: String(d * 10).padStart(2, "0") })),
      units: digits
    };
  }
  if ( faces <= MAX_FACE_BUTTONS ) return { faces: Array.from({ length: faces }, (_, i) => i + 1) };
  return null;
}

/**
 * Validate a result for a die: an integer between 1 and the number of faces, or null.
 * @param {unknown} value
 * @param {number} faces
 * @returns {number|null}
 */
export function parseResult(value, faces) {
  if ( value === "" || value === null || value === undefined ) return null;
  const n = Number(value);
  return Number.isInteger(n) && (n >= 1) && (n <= faces) ? n : null;
}

/**
 * Put a value in the first empty input of a term's fieldset.
 * Inputs added for rerolls or explosions have their own confirm button, which is clicked so the roll continues.
 * @param {HTMLElement|null} root
 * @param {string} termId
 * @param {number|string} value
 * @returns {HTMLInputElement|null}  The filled input, or null if every input already has a value.
 */
export function fillSlot(root, termId, value) {
  const fieldset = root?.querySelector(`fieldset[data-term-id="${CSS.escape(termId)}"]`);
  if ( !fieldset ) return null;
  const input = [...fieldset.querySelectorAll("input:not(:disabled)")].find(i => i.value === "");
  if ( !input ) return null;
  input.value = String(value);
  input.closest(".form-fields")?.querySelector("button.submit-result")?.dispatchEvent(new MouseEvent("click"));
  return input;
}

/**
 * Clear every editable input, so a mis-click can be corrected before confirming.
 * @param {HTMLElement} root
 */
export function clearSlots(root) {
  for ( const input of root.querySelectorAll("fieldset[data-term-id] input:not(:disabled, [readonly])") ) input.value = "";
  for ( const fieldset of root.querySelectorAll("fieldset[data-tens]") ) resetTens(fieldset);
}

/**
 * Forget the tens picked for a percentile die, and unmark its tens buttons.
 * @param {HTMLFieldSetElement} fieldset
 */
function resetTens(fieldset) {
  delete fieldset.dataset.tens;
  for ( const b of fieldset.querySelectorAll("[data-tens]") ) b.classList.remove("active");
}

/**
 * Handle a click on a keypad button.
 * @param {HTMLElement} root
 * @param {HTMLElement} target
 */
export function onPadClick(root, target) {
  const fieldset = target.closest("fieldset[data-term-id]");
  if ( !fieldset ) return;
  const { termId } = fieldset.dataset;

  // Percentile: pick the tens die first, then the units die. 00 + 0 is 100.
  if ( target.dataset.tens !== undefined ) {
    resetTens(fieldset);
    fieldset.dataset.tens = target.dataset.tens;
    target.classList.add("active");
    return;
  }
  let value;
  if ( target.dataset.unit !== undefined ) {
    value = (Number(fieldset.dataset.tens ?? 0) + Number(target.dataset.unit)) || 100;
    resetTens(fieldset);
  }
  else value = Number(target.dataset.value);

  if ( !fillSlot(root, termId, value) ) ui.notifications.warn("AVTT.Dice.AllEntered", { localize: true });
}
