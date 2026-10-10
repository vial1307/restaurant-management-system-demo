import assert from "node:assert/strict";
import { evaluateLocationReorderAlert } from "../src/procurement-threshold.js";

const rule={
 reorderAlertEnabled:true,reorderLocationId:"live-seafood-area",
 reorderReferenceQuantity:30,reorderNumerator:1,reorderDenominator:3
};
const live=(amount)=>[{location_id:"live-seafood-area",configured:true,quantity:amount},{location_id:"freezer",configured:true,quantity:900}];
assert.deepEqual(evaluateLocationReorderAlert({rule:{reorderAlertEnabled:false},stockRows:live(0)}),{status:"disabled",triggered:false});
assert.equal(evaluateLocationReorderAlert({rule,stockRows:live(11)}).triggered,false,"11 of 30 > 1/3");
assert.equal(evaluateLocationReorderAlert({rule,stockRows:live(10)}).triggered,true,"exactly 1/3 must trigger");
assert.equal(evaluateLocationReorderAlert({rule,stockRows:live(9.5)}).triggered,true,"below 1/3 triggers");
assert.equal(evaluateLocationReorderAlert({rule,stockRows:live(10.001)}).triggered,false,"do not round 10.001 down to 10");
assert.equal(evaluateLocationReorderAlert({rule,stockRows:[{location_id:"freezer",quantity:0}]}).status,"missingStock","no location means no false empty alert");
assert.equal(evaluateLocationReorderAlert({rule,stockRows:[{location_id:"live-seafood-area",quantity:0,configured:false}]}).status,"missingStock","archived location must not produce alert");
assert.equal(evaluateLocationReorderAlert({rule:{...rule,reorderReferenceQuantity:0},stockRows:live(0)}).status,"invalid");
assert.equal(evaluateLocationReorderAlert({rule:{...rule,reorderNumerator:4},stockRows:live(0)}).status,"invalid");
assert.equal(evaluateLocationReorderAlert({rule:{...rule,reorderNumerator:2,reorderDenominator:3},stockRows:live(20)}).triggered,true,"configurable ratio");
console.log("PROCUREMENT_LOCATION_FRACTION_ALERT_OK");
