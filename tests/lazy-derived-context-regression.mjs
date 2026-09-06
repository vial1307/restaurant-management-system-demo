import assert from "node:assert/strict";
import { defineLazyDerivedProperties } from "../src/lazy-derived-context.js";

const calls = { a:0, b:0, unused:0, retry:0 };
let context = { base:7 };
context = defineLazyDerivedProperties(context, {
  a:() => {
    calls.a += 1;
    return context.base + 1;
  },
  b:() => {
    calls.b += 1;
    return context.a + 1;
  },
  unused:() => {
    calls.unused += 1;
    return 99;
  },
  retry:() => {
    calls.retry += 1;
    if (calls.retry === 1) throw new Error("intentional-first-failure");
    return 42;
  },
});

assert.deepEqual(calls, { a:0, b:0, unused:0, retry:0 }, "constructing lazy context must not execute factories");
assert.deepEqual(Object.keys(context).sort(), ["a", "b", "base", "retry", "unused"], "lazy properties must remain enumerable");

assert.equal(context.b, 9, "dependent lazy value must resolve correctly");
assert.deepEqual(calls, { a:1, b:1, unused:0, retry:0 }, "reading b must resolve only b and dependency a");
assert.equal(context.b, 9, "memoized lazy value must remain stable");
assert.equal(context.a, 8, "dependency value must remain memoized");
assert.deepEqual(calls, { a:1, b:1, unused:0, retry:0 }, "successful lazy factories must run at most once");
assert.equal(Object.getOwnPropertyDescriptor(context, "b")?.get, undefined, "successful resolution should materialize a normal data property");

assert.throws(() => context.retry, /intentional-first-failure/, "first failing factory read must surface its error");
assert.equal(calls.retry, 1, "failing factory must execute once for the failed read");
assert.equal(typeof Object.getOwnPropertyDescriptor(context, "retry")?.get, "function", "failed factory must remain lazy for retry");
assert.equal(context.retry, 42, "later read must retry a previously failing factory");
assert.equal(calls.retry, 2, "retry must execute the factory again after failure");
assert.equal(context.retry, 42, "successful retry must then memoize");
assert.equal(calls.retry, 2, "successful retry must not execute again");
assert.equal(calls.unused, 0, "unread lazy factory must remain completely untouched");

context.unused = 5;
assert.equal(context.unused, 5, "assignment before first read must materialize the assigned value without running factory");
assert.equal(calls.unused, 0, "assignment must not invoke an unread factory");

console.log("LAZY_DERIVED_CONTEXT_REGRESSION_OK");
