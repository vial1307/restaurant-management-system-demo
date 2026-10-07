import assert from "node:assert/strict";
import {
  prepareIngredientNameSearchCorpus,
  prepareSearchNeedle,
  preparedSearchMatches,
} from "../src/search-utils.js";

const corpus = prepareIngredientNameSearchCorpus("牛肉", "Thịt bò");
const matches = (query) => preparedSearchMatches(corpus, prepareSearchNeedle(query));

for (const query of [
  "牛肉",
  "thịt bò",
  "thit bo",
  "niu rou",
  "niurou",
  "nr",
  "ㄋㄧㄡㄖㄡ",
]) {
  assert.equal(matches(query), true, `ingredient-name search should match "${query}"`);
}

for (const query of [
  "大冷凍",
  "冷藏",
  "freezer",
  "kg",
  "MEAT",
  "工作區",
]) {
  assert.equal(matches(query), false, `ingredient-name search must not match non-name metadata "${query}"`);
}

console.log("inventory ingredient-name search contract regression passed");
