import assert from "node:assert/strict";
import {
  ingredientNameSearchMatches,
  prepareIngredientNameSearchCorpus,
  prepareIngredientNameSearchNeedle,
} from "../src/search-utils.js";

const beef = prepareIngredientNameSearchCorpus("牛肉", "Thịt bò");
const tendon = prepareIngredientNameSearchCorpus("牛筋", "Gân bò");
const powder = prepareIngredientNameSearchCorpus("粉類", "Bột");

const matches = (corpus, query) =>
  ingredientNameSearchMatches(corpus, prepareIngredientNameSearchNeedle(query));

for (const query of ["牛", "牛肉", "bò", "Thịt bò", "thịt"]) {
  assert.equal(matches(beef, query), true, `literal ingredient search should match "${query}"`);
}

assert.equal(matches(tendon, "bò"), true, "Vietnamese substring should match Vietnamese product names");
assert.equal(matches(beef, "niu rou"), false, "Pinyin must not be inferred from Chinese names");
assert.equal(matches(beef, "nr"), false, "Pinyin initials must not be inferred");
assert.equal(matches(beef, "ㄋㄧㄡㄖㄡ"), false, "Zhuyin must not be inferred");
assert.equal(matches(beef, "thit bo"), false, "Vietnamese diacritics must not be stripped for literal search");
assert.equal(matches(powder, "bò"), false, "bò must not normalize into bo and match Bột");
assert.equal(matches(beef, "大冷凍"), false, "storage locations must not match ingredient search");
assert.equal(matches(beef, "kg"), false, "units must not match ingredient search");

console.log("inventory literal ingredient-name search contract regression passed");
