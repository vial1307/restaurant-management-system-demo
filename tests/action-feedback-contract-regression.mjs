import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const feedback = read("src/action-feedback.js");
const allButtonFeedback = read("src/all-button-feedback.js");
const css = read("src/action-feedback.css");
const index = read("index.html");
const vpsEntry = read("vps-entry.html");

assert.equal(index, vpsEntry, "canonical and VPS shells must stay identical");
assert(index.includes("src/action-feedback.css?v=__KITCHEN_RELEASE__"), "feedback CSS must be release-stamped and loaded");
assert(index.includes("src/action-feedback.js?v=__KITCHEN_RELEASE__"), "feedback runtime must be release-stamped and loaded");
assert(index.includes("src/all-button-feedback.js?v=__KITCHEN_RELEASE__"), "universal button feedback runtime must be release-stamped and loaded");
assert(
  index.indexOf("src/action-feedback.js?v=__KITCHEN_RELEASE__") < index.indexOf("src/vps-auth-bridge.js?v=__KITCHEN_RELEASE__"),
  "feedback capture listener must load before VPS auth handlers that stop immediate propagation"
);
assert(
  index.indexOf("src/action-feedback.js?v=__KITCHEN_RELEASE__") < index.indexOf("src/all-button-feedback.js?v=__KITCHEN_RELEASE__"),
  "confirmed-write feedback must register before generic button feedback"
);

assert.match(feedback, /shitu:business-persistence-status/, "business saves must drive user feedback");
assert.match(feedback, /status === "saved"[\s\S]{0,180}resolveEntry/, "business popup must close only after confirmed save");
assert.match(feedback, /status === "error"[\s\S]{0,180}failEntry/, "business save failures must surface feedback");
assert.match(feedback, /shitu:inventory-cloud-status/, "inventory writes must drive user feedback");
assert.match(feedback, /status === "synced"[\s\S]{0,120}inventory-success/, "inventory success must wait for a synced result");
assert.match(feedback, /shitu:accounts-synced/, "account changes must wait for VPS account synchronization");
assert.match(feedback, /closeSuccessfulPopup\(entry\.modal\)/, "successful modal actions must auto-close");
assert.match(feedback, /TOAST_VISIBLE_MS\s*=\s*2600/, "success toast must auto-dismiss instead of remaining as a popup");
assert.match(feedback, /ERROR_VISIBLE_MS\s*=\s*5200/, "errors must remain visible longer than success feedback");
assert.match(feedback, /\[data-op-submit\]/, "inventory operation buttons must receive result notifications");
assert.match(feedback, /\[data-account-form\]/, "account save popup must receive result notifications");
assert.match(feedback, /save-sop/, "SOP save modal must participate in confirmed-save feedback");
assert.match(feedback, /save-staff/, "staff save modal must participate in confirmed-save feedback");
assert.match(feedback, /save-schedule/, "schedule save modal must participate in confirmed-save feedback");

assert.match(allButtonFeedback, /const BUTTON_SELECTOR = \[/, "universal button feedback must use one delegated selector");
assert.match(allButtonFeedback, /"button"/, "native button controls must be covered");
assert.match(allButtonFeedback, /\[role="button"\]/, "ARIA button controls must be covered");
assert.match(allButtonFeedback, /input\[type="button"\]/, "input button controls must be covered");
assert.match(allButtonFeedback, /input\[type="submit"\]/, "submit controls must be covered");
assert.match(allButtonFeedback, /input\[type="reset"\]/, "reset controls must be covered");
assert.match(allButtonFeedback, /document\.addEventListener\("click", handleAnyButtonClick, true\)/, "dynamically rendered buttons must be covered by delegated capture");
assert.match(allButtonFeedback, /usesConfirmedWriteFeedback\(control\)/, "confirmed writes must not receive optimistic generic success feedback");
assert.match(allButtonFeedback, /\[data-action-feedback-host\]/, "feedback toast controls must be excluded to prevent recursive notifications");
assert.match(allButtonFeedback, /control\.matches\(":disabled"\)/, "disabled buttons must not emit feedback");
assert.match(allButtonFeedback, /pointerEvents = "none"/, "generic feedback must not block later mobile or desktop clicks");
assert.match(allButtonFeedback, /FLASH_MS\s*=\s*1150/, "generic UI feedback must auto-dismiss quickly");
assert.match(allButtonFeedback, /old\.remove\(\)/, "generic UI feedback must replace instead of stack during rapid navigation");
assert.match(allButtonFeedback, /Đã thực hiện/, "Vietnamese generic button feedback must be present");
assert.match(allButtonFeedback, /操作已執行/, "Traditional Chinese generic button feedback must be present");

assert.match(css, /position:\s*fixed/, "toast host must remain visible above the application");
assert.match(css, /z-index:\s*10050/, "toast must sit above existing modal layers");
assert.match(css, /@media \(max-width: 640px\)/, "feedback must have a mobile layout contract");
assert.match(css, /prefers-reduced-motion/, "feedback animation must respect reduced-motion preferences");

console.log("ACTION_FEEDBACK_CONTRACT_OK");
