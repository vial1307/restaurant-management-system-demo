const PHONETIC = {
  央:["yang","ㄧㄤ"],廚:["chu","ㄔㄨ"],冷:["leng","ㄌㄥ"],凍:["dong","ㄉㄨㄥ"],藏:["cang","ㄘㄤ"],冰:["bing","ㄅㄧㄥ"],箱:["xiang","ㄒㄧㄤ"],門:["men","ㄇㄣ"],臥:["wo","ㄨㄛ"],櫃:["gui","ㄍㄨㄟ"],
  牛:["niu","ㄋㄧㄡ"],肉:["rou","ㄖㄡ"],豬:["zhu","ㄓㄨ"],羊:["yang","ㄧㄤ"],雞:["ji","ㄐㄧ"],鴨:["ya","ㄧㄚ"],魚:["yu","ㄩ"],蝦:["xia","ㄒㄧㄚ"],海:["hai","ㄏㄞ"],鮮:["xian","ㄒㄧㄢ"],
  麻:["ma","ㄇㄚ"],辣:["la","ㄌㄚ"],湯:["tang","ㄊㄤ"],醬:["jiang","ㄐㄧㄤ"],油:["you","ㄧㄡ"],汁:["zhi","ㄓ"],飯:["fan","ㄈㄢ"],麵:["mian","ㄇㄧㄢ"],米:["mi","ㄇㄧ"],
  炸:["zha","ㄓㄚ"],滷:["lu","ㄌㄨ"],煮:["zhu","ㄓㄨ"],燴:["hui","ㄏㄨㄟ"],泡:["pao","ㄆㄠ"],舒:["shu","ㄕㄨ"],肥:["fei","ㄈㄟ"],原:["yuan","ㄩㄢ"],骨:["gu","ㄍㄨ"],
  豆:["dou","ㄉㄡ"],腐:["fu","ㄈㄨ"],乾:["gan","ㄍㄢ"],干:["gan","ㄍㄢ"],皮:["pi","ㄆㄧ"],芋:["yu","ㄩ"],頭:["tou","ㄊㄡ"],丸:["wan","ㄨㄢ"],蛋:["dan","ㄉㄢ"],餃:["jiao","ㄐㄧㄠ"],
  尾:["wei","ㄨㄟ"],肚:["du","ㄉㄨ"],舌:["she","ㄕㄜ"],翅:["chi","ㄔ"],腸:["chang","ㄔㄤ"],腳:["jiao","ㄐㄧㄠ"],血:["xue","ㄒㄩㄝ"],排:["pai","ㄆㄞ"],酥:["su","ㄙㄨ"],
  花:["hua","ㄏㄨㄚ"],枝:["zhi","ㄓ"],漿:["jiang","ㄐㄧㄤ"],昆:["kun","ㄎㄨㄣ"],布:["bu","ㄅㄨ"],重:["zhong","ㄓㄨㄥ"],輕:["qing","ㄑㄧㄥ"],川:["chuan","ㄔㄨㄢ"],秘:["mi","ㄇㄧ"],蒜:["suan","ㄙㄨㄢ"],
  大:["da","ㄉㄚ"],小:["xiao","ㄒㄧㄠ"],白:["bai","ㄅㄞ"],黃:["huang","ㄏㄨㄤ"],紅:["hong","ㄏㄨㄥ"],黑:["hei","ㄏㄟ"],清:["qing","ㄑㄧㄥ"],香:["xiang","ㄒㄧㄤ"],復:["fu","ㄈㄨ"],興:["xing","ㄒㄧㄥ"],永:["yong","ㄩㄥ"],吉:["ji","ㄐㄧ"],店:["dian","ㄉㄧㄢ"],
  地:["di","ㄉㄧ"],獄:["yu","ㄩ"],濃:["nong","ㄋㄨㄥ"],縮:["suo","ㄙㄨㄛ"],肩:["jian","ㄐㄧㄢ"],胸:["xiong","ㄒㄩㄥ"],筋:["jin","ㄐㄧㄣ"],喉:["hou","ㄏㄡ"],蛙:["wa","ㄨㄚ"],
  法:["fa","ㄈㄚ"],國:["guo","ㄍㄨㄛ"],可:["ke","ㄎㄜ"],頌:["song","ㄙㄨㄥ"],虎:["hu","ㄏㄨ"],三:["san","ㄙㄢ"],記:["ji","ㄐㄧ"],追:["zhui","ㄓㄨㄟ"],
};

const PHRASE_ALIASES = {
  "四門冰箱": ["simenbingxiang", "si men bing xiang", "ㄙㄇㄣㄅㄧㄥㄒㄧㄤ"],
  "大冷凍": ["dalengdong", "da leng dong", "ㄉㄚㄌㄥㄉㄨㄥ"],
  "大冷藏": ["dalengcang", "da leng cang", "ㄉㄚㄌㄥㄘㄤ"],
  "廚房冰箱": ["chufangbingxiang", "chu fang bing xiang", "ㄔㄨㄈㄤㄅㄧㄥㄒㄧㄤ"],
  "央廚冷凍": ["yangchulengdong", "yang chu leng dong", "ㄧㄤㄔㄨㄌㄥㄉㄨㄥ"],
  "央廚4門": ["yangchusimen", "yang chu si men", "ㄧㄤㄔㄨㄙㄇㄣ"],
  "央廚臥櫃": ["yangchuwogui", "yang chu wo gui", "ㄧㄤㄔㄨㄨㄛㄍㄨㄟ"],
  "央廚冷藏": ["yangchulengcang", "yang chu leng cang", "ㄧㄤㄔㄨㄌㄥㄘㄤ"],
  "牛肉": ["niurou", "niu rou", "ㄋㄧㄡㄖㄡ"],
  "牛尾": ["niuwei", "niu wei", "ㄋㄧㄡㄨㄟ"],
  "牛肚": ["niudu", "niu du", "ㄋㄧㄡㄉㄨ"],
  "鴨舌": ["yashe", "ya she", "ㄧㄚㄕㄜ"],
  "鴨翅": ["yachi", "ya chi", "ㄧㄚㄔ"],
  "鴨腸": ["yachang", "ya chang", "ㄧㄚㄔㄤ"],
  "豆干": ["dougan", "dou gan", "ㄉㄡㄍㄢ"],
  "花枝漿": ["huazhijiang", "hua zhi jiang", "ㄏㄨㄚㄓㄐㄧㄤ"],
  "炸芋頭": ["zhayutou", "zha yu tou", "ㄓㄚㄩㄊㄡ"],
  "排骨酥": ["paigusu", "pai gu su", "ㄆㄞㄍㄨㄙㄨ"],
  "麻辣湯": ["malatang", "ma la tang", "ㄇㄚㄌㄚㄊㄤ"],
  "復興店": ["fuxing", "fu xing", "fuxingdian", "ㄈㄨㄒㄧㄥ"],
  "永吉店": ["yongji", "yong ji", "yongjidian", "ㄩㄥㄐㄧ"],
};

export function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ˊˇˋ˙]/g, "")
    .replace(/[\s._\-\/()（）·]+/g, "");
}

export function phoneticOf(text) {
  let pinyin = "";
  let zhuyin = "";
  const source = String(text || "");

  for (const ch of source) {
    const item = PHONETIC[ch];
    if (!item) continue;
    pinyin += item[0];
    zhuyin += item[1];
  }

  const aliases = [];
  for (const [phrase, list] of Object.entries(PHRASE_ALIASES)) {
    if (source.includes(phrase)) aliases.push(...list);
  }

  return `${pinyin} ${zhuyin} ${aliases.join(" ")}`;
}

export function buildSearchText(text) {
  const source = String(text || "");
  return `${source} ${phoneticOf(source)}`;
}

export function searchMatches(text, query) {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(buildSearchText(text)).includes(needle);
}
