/** Legacy name. `Toggle` always rendered a checkbox; the primitive now lives
 *  in Checkbox.tsx under the name that matches what it draws. New code imports
 *  `Checkbox`; this alias keeps existing call sites compiling. */
export { Checkbox as Toggle } from "./Checkbox"
