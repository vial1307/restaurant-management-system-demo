import assert from "node:assert/strict";
import { actionablePageErrors } from "./browser-page-error-policy.mjs";

const localSseError = "/127.0.0.1:3000/api/inventory/events?clientId=regression-client due to access control checks.";

assert.deepEqual(actionablePageErrors([localSseError], "webkit"), []);
assert.deepEqual(actionablePageErrors([localSseError], "chromium"), [localSseError]);
assert.deepEqual(
  actionablePageErrors(["/127.0.0.1:3000/api/inventory/fuxing due to access control checks."], "webkit"),
  ["/127.0.0.1:3000/api/inventory/fuxing due to access control checks."]
);
assert.deepEqual(
  actionablePageErrors(["https://example.com/api/inventory/events?clientId=regression-client due to access control checks."], "webkit"),
  ["https://example.com/api/inventory/events?clientId=regression-client due to access control checks."]
);
assert.deepEqual(actionablePageErrors(["real application failure"], "webkit"), ["real application failure"]);

console.log("BROWSER_PAGE_ERROR_POLICY_OK");
