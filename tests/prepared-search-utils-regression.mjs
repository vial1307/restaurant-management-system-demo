import assert from "node:assert/strict";
import * as search from "../src/search-utils.js";
import { currentSearchEvaluationToken } from "../src/search-evaluation-cache.js";

for (const name of ["prepareSearchNeedle", "prepareSearchCorpus", "preparedSearchMatches"]) {
  assert.equal(typeof search[name], "function", `${name} must be exported by search-utils`);
}

const cases = [
  { text: "牛肉 大冷凍", query: "牛肉" },
  { text: "牛肉 大冷凍", query: "niurou" },
  { text: "牛肉 大冷凍", query: "niu rou" },
  { text: "牛肉 大冷凍", query: "ㄋㄧㄡㄖㄡ" },
  { text: "復興店 冷藏", query: "fuxing" },
  { text: "復興店 冷藏", query: "fu xing" },
  { text: "復興店 冷藏", query: "ㄈㄨㄒㄧㄥ" },
  { text: "Thịt bò kho", query: "thit bo" },
  { text: "Mì sợi nhỏ", query: "mi soi" },
  { text: "鴨舌", query: "yachi", expected: false },
  { text: "牛肉", query: "", expected: true },
];

for (const entry of cases) {
  const legacy = search.searchMatches(entry.text, entry.query);
  const prepared = search.preparedSearchMatches(
    search.prepareSearchCorpus(entry.text),
    search.prepareSearchNeedle(entry.query),
  );
  assert.equal(prepared, legacy, `prepared search must equal legacy search for ${entry.text} / ${entry.query}`);
  if (Object.hasOwn(entry, "expected")) assert.equal(prepared, entry.expected);
}

assert.equal(search.prepareSearchNeedle(" Niu Rou "), search.normalizeSearch(" Niu Rou "), "prepared needle must use the existing normalization contract");
const corpus = search.prepareSearchCorpus("牛肉 復興店");
for (const expected of ["牛肉", "niurou", "ㄋㄧㄡㄖㄡ", "fuxing", "ㄈㄨㄒㄧㄥ"]) {
  assert.ok(corpus.includes(search.normalizeSearch(expected)), `prepared corpus must retain ${expected}`);
}

await Promise.resolve();
assert.equal(currentSearchEvaluationToken(), 0, "search token must begin cleared");
assert.equal(search.preparedSearchMatches(corpus, ""), true, "empty prepared needle must match");
assert.equal(currentSearchEvaluationToken(), 0, "empty prepared matching must not open a search token");
assert.equal(search.preparedSearchMatches(corpus, search.prepareSearchNeedle("niurou")), true);
assert.ok(currentSearchEvaluationToken() > 0, "non-empty prepared matching must preserve search evaluation token semantics");
await Promise.resolve();
assert.equal(currentSearchEvaluationToken(), 0, "search evaluation token must clear at the microtask checkpoint");

console.log("PREPARED_SEARCH_UTILS_REGRESSION_OK");
