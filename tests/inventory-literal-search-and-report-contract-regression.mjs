import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ingredientNameSearchMatches,
  prepareIngredientNameSearchCorpus,
  prepareIngredientNameSearchNeedle,
} from "../src/search-utils.js";

const match=(corpus,query)=>ingredientNameSearchMatches(corpus,prepareIngredientNameSearchNeedle(query));

const fish=prepareIngredientNameSearchCorpus("鮭魚","Cá hồi");
const beef=prepareIngredientNameSearchCorpus("牛肉","Thịt bò");
const powder=prepareIngredientNameSearchCorpus("粉類","Bột");
const fishBall=prepareIngredientNameSearchCorpus("魚丸","Viên cá");

assert.equal(match(fish,"cá"),true,"Vietnamese literal substring must match actual Vietnamese product name");
assert.equal(match(fishBall,"cá"),true,"Vietnamese literal substring must match another actual Vietnamese product name");
assert.equal(match(fish,"ca"),false,"Vietnamese diacritics must be preserved; ca must not infer cá");
assert.equal(match(beef,"bò"),true,"bò must match Thịt bò");
assert.equal(match(powder,"bò"),false,"bò must not normalize to bo and match Bột");
assert.equal(match(fishBall,"魚"),true,"Chinese literal substring must match actual Chinese product name");
assert.equal(match(fishBall,"yu"),false,"Pinyin must not infer Chinese product names");
assert.equal(match(beef,"niu rou"),false,"Pinyin phrases must not infer 牛肉");
assert.equal(match(beef,"nr"),false,"initials must not infer 牛肉");
assert.equal(match(beef,"ㄋㄧㄡ"),false,"Zhuyin must not infer 牛肉");
assert.equal(match(beef,"kg"),false,"units are not searchable product-name fields");
assert.equal(match(beef,"大冷凍"),false,"locations are not searchable product-name fields");

const app=fs.readFileSync("src/app.js","utf8");
const ops=fs.readFileSync("src/inventory-operations.js","utf8");
const reports=fs.readFileSync("src/inventory-reports.js","utf8");
const reportCss=fs.readFileSync("src/inventory-reports.css","utf8");
const management=fs.readFileSync("src/management.js","utf8");

assert.match(app,/prepareIngredientNameSearchNeedle/);
assert.match(app,/ingredientNameSearchMatches/);
assert.match(app,/Tìm theo đúng tên sản phẩm/);
assert.doesNotMatch(app,/Tìm tên, Pinyin\/注音, viết tắt hoặc vị trí/);

assert.match(ops,/prepareIngredientNameSearchCorpus/);
assert.match(ops,/ingredientNameSearchMatches/);
assert.match(ops,/Tìm theo đúng tên sản phẩm/);
assert.doesNotMatch(ops,/Tìm tên, Pinyin\/注音, viết tắt hoặc vị trí/);
assert.doesNotMatch(ops,/搜尋品項、Pinyin\/注音、縮寫或儲位/);

assert.match(reports,/apiRequest\("\/api\/inventory\/sites"\)/);
assert.match(reports,/apiRequest\(\`\/api\/inventory\//);
assert.match(reports,/apiRequest\(\`\/api\/master-data\//);
assert.match(reports,/prepareIngredientNameSearchCorpus/);
assert.match(reports,/prepareIngredientNameSearchNeedle/);
assert.match(reports,/data-report-action="copy"/);
assert.match(reports,/data-report-action="txt"/);
assert.match(reports,/data-report-action="pdf"/);
assert.match(reports,/data-report-action="csv"/);
assert.match(reports,/navigator\.clipboard\.writeText/);
assert.match(reports,/new Blob/);

assert.match(management,/data-inventory-report-host/);
assert.match(management,/PostgreSQL/);
assert.match(reportCss,/@media \(max-width:640px\)/);
assert.match(reportCss,/@media print/);
assert.doesNotMatch(reportCss,/\.inventory-page\b/,"Reports stylesheet must not redesign the existing Inventory page");

console.log("INVENTORY_LITERAL_SEARCH_AND_REPORT_CONTRACT_OK");
