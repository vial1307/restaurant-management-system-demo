import assert from "node:assert/strict";
import * as search from "../src/search-utils.js";
import { currentSearchEvaluationToken } from "../src/search-evaluation-cache.js";

for (const name of ["prepareSearchNeedle", "prepareSearchCorpus", "preparedSearchMatches"]) {
  assert.equal(typeof search[name], "function", `${name} must be exported by search-utils`);
}

const cases = [
  { text: "牛肉 大冷凍", query: "牛肉", expected: true },
  { text: "牛肉 大冷凍", query: "niurou", expected: true },
  { text: "牛肉 大冷凍", query: "niu rou", expected: true },
  { text: "牛肉 大冷凍", query: "rou niu", expected: true },
  { text: "牛肉 大冷凍", query: "niu rou leng dong", expected: true },
  { text: "牛肉 大冷凍", query: "nr", expected: true },
  { text: "牛肉 大冷凍", query: "n r", expected: true },
  { text: "牛肉 大冷凍", query: "dld", expected: true },
  { text: "牛肉 大冷凍", query: "ㄋㄧㄡ ㄖㄡ", expected: true },
  { text: "復興店 冷藏", query: "fuxing", expected: true },
  { text: "復興店 冷藏", query: "fu xing", expected: true },
  { text: "復興店 冷藏", query: "ㄈㄨㄒㄧㄥ", expected: true },
  { text: "Thịt bò kho", query: "thit bo", expected: true },
  { text: "Thịt bò kho", query: "t b", expected: true },
  { text: "Mì sợi nhỏ", query: "mi nho", expected: true },
  { text: "鴨舌", query: "yachi", expected: false },
  { text: "牛肉", query: "niu ya", expected: false },
  { text: "牛肉", query: "", expected: true },
];

for (const entry of cases) {
  const publicResult = search.searchMatches(entry.text, entry.query);
  const prepared = search.preparedSearchMatches(
    search.prepareSearchCorpus(entry.text),
    search.prepareSearchNeedle(entry.query),
  );
  assert.equal(publicResult, entry.expected, `searchMatches mismatch for ${entry.text} / ${entry.query}`);
  assert.equal(prepared, entry.expected, `prepared search mismatch for ${entry.text} / ${entry.query}`);
}

assert.equal(search.normalizeSearch(" Thịt-bò "), "thitbo", "base normalization contract must remain compact");
assert.notEqual(
  search.prepareSearchNeedle("Niu Rou"),
  search.normalizeSearch("Niu Rou"),
  "multi-token query must preserve token boundaries instead of collapsing to one phrase",
);
const corpus = search.prepareSearchCorpus("牛肉 復興店");
for (const expected of ["牛肉", "niurou", "nr", "ㄋㄧㄡㄖㄡ", "fuxing", "ㄈㄨㄒㄧㄥ"]) {
  assert.ok(corpus.includes(search.normalizeSearch(expected)), `prepared corpus must retain ${expected}`);
}

await Promise.resolve();
assert.equal(currentSearchEvaluationToken(), 0, "search token must begin cleared");
assert.equal(search.preparedSearchMatches(corpus, ""), true, "empty prepared needle must match");
assert.equal(currentSearchEvaluationToken(), 0, "empty prepared matching must not open a search token");
assert.equal(search.preparedSearchMatches(corpus, search.prepareSearchNeedle("niu rou")), true);
assert.ok(currentSearchEvaluationToken() > 0, "non-empty prepared matching must preserve search evaluation token semantics");
await Promise.resolve();
assert.equal(currentSearchEvaluationToken(), 0, "search evaluation token must clear at the microtask checkpoint");

console.log("PREPARED_SEARCH_UTILS_REGRESSION_OK");
