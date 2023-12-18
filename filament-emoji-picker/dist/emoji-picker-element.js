// node_modules/emoji-picker-element/database.js
function assertNonEmptyString(str) {
  if (typeof str !== "string" || !str) {
    throw new Error("expected a non-empty string, got: " + str);
  }
}
function assertNumber(number) {
  if (typeof number !== "number") {
    throw new Error("expected a number, got: " + number);
  }
}
var DB_VERSION_CURRENT = 1;
var DB_VERSION_INITIAL = 1;
var STORE_EMOJI = "emoji";
var STORE_KEYVALUE = "keyvalue";
var STORE_FAVORITES = "favorites";
var FIELD_TOKENS = "tokens";
var INDEX_TOKENS = "tokens";
var FIELD_UNICODE = "unicode";
var INDEX_COUNT = "count";
var FIELD_GROUP = "group";
var FIELD_ORDER = "order";
var INDEX_GROUP_AND_ORDER = "group-order";
var KEY_ETAG = "eTag";
var KEY_URL = "url";
var KEY_PREFERRED_SKINTONE = "skinTone";
var MODE_READONLY = "readonly";
var MODE_READWRITE = "readwrite";
var INDEX_SKIN_UNICODE = "skinUnicodes";
var FIELD_SKIN_UNICODE = "skinUnicodes";
var DEFAULT_DATA_SOURCE = "https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json";
var DEFAULT_LOCALE = "en";
function uniqBy(arr, func) {
  const set2 = /* @__PURE__ */ new Set();
  const res = [];
  for (const item of arr) {
    const key = func(item);
    if (!set2.has(key)) {
      set2.add(key);
      res.push(item);
    }
  }
  return res;
}
function uniqEmoji(emojis) {
  return uniqBy(emojis, (_) => _.unicode);
}
function initialMigration(db) {
  function createObjectStore(name, keyPath, indexes) {
    const store = keyPath ? db.createObjectStore(name, { keyPath }) : db.createObjectStore(name);
    if (indexes) {
      for (const [indexName, [keyPath2, multiEntry]] of Object.entries(indexes)) {
        store.createIndex(indexName, keyPath2, { multiEntry });
      }
    }
    return store;
  }
  createObjectStore(STORE_KEYVALUE);
  createObjectStore(
    STORE_EMOJI,
    /* keyPath */
    FIELD_UNICODE,
    {
      [INDEX_TOKENS]: [
        FIELD_TOKENS,
        /* multiEntry */
        true
      ],
      [INDEX_GROUP_AND_ORDER]: [[FIELD_GROUP, FIELD_ORDER]],
      [INDEX_SKIN_UNICODE]: [
        FIELD_SKIN_UNICODE,
        /* multiEntry */
        true
      ]
    }
  );
  createObjectStore(STORE_FAVORITES, void 0, {
    [INDEX_COUNT]: [""]
  });
}
var openIndexedDBRequests = {};
var databaseCache = {};
var onCloseListeners = {};
function handleOpenOrDeleteReq(resolve, reject, req) {
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error("IDB blocked"));
  req.onsuccess = () => resolve(req.result);
}
async function createDatabase(dbName) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION_CURRENT);
    openIndexedDBRequests[dbName] = req;
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < DB_VERSION_INITIAL) {
        initialMigration(req.result);
      }
    };
    handleOpenOrDeleteReq(resolve, reject, req);
  });
  db.onclose = () => closeDatabase(dbName);
  return db;
}
function openDatabase(dbName) {
  if (!databaseCache[dbName]) {
    databaseCache[dbName] = createDatabase(dbName);
  }
  return databaseCache[dbName];
}
function dbPromise(db, storeName, readOnlyOrReadWrite, cb) {
  return new Promise((resolve, reject) => {
    const txn = db.transaction(storeName, readOnlyOrReadWrite, { durability: "relaxed" });
    const store = typeof storeName === "string" ? txn.objectStore(storeName) : storeName.map((name) => txn.objectStore(name));
    let res;
    cb(store, txn, (result) => {
      res = result;
    });
    txn.oncomplete = () => resolve(res);
    txn.onerror = () => reject(txn.error);
  });
}
function closeDatabase(dbName) {
  const req = openIndexedDBRequests[dbName];
  const db = req && req.result;
  if (db) {
    db.close();
    const listeners = onCloseListeners[dbName];
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
  delete openIndexedDBRequests[dbName];
  delete databaseCache[dbName];
  delete onCloseListeners[dbName];
}
function deleteDatabase(dbName) {
  return new Promise((resolve, reject) => {
    closeDatabase(dbName);
    const req = indexedDB.deleteDatabase(dbName);
    handleOpenOrDeleteReq(resolve, reject, req);
  });
}
function addOnCloseListener(dbName, listener) {
  let listeners = onCloseListeners[dbName];
  if (!listeners) {
    listeners = onCloseListeners[dbName] = [];
  }
  listeners.push(listener);
}
var irregularEmoticons = /* @__PURE__ */ new Set([
  ":D",
  "XD",
  ":'D",
  "O:)",
  ":X",
  ":P",
  ";P",
  "XP",
  ":L",
  ":Z",
  ":j",
  "8D",
  "XO",
  "8)",
  ":B",
  ":O",
  ":S",
  ":'o",
  "Dx",
  "X(",
  "D:",
  ":C",
  ">0)",
  ":3",
  "</3",
  "<3",
  "\\M/",
  ":E",
  "8#"
]);
function extractTokens(str) {
  return str.split(/[\s_]+/).map((word) => {
    if (!word.match(/\w/) || irregularEmoticons.has(word)) {
      return word.toLowerCase();
    }
    return word.replace(/[)(:,]/g, "").replace(/’/g, "'").toLowerCase();
  }).filter(Boolean);
}
var MIN_SEARCH_TEXT_LENGTH = 2;
function normalizeTokens(str) {
  return str.filter(Boolean).map((_) => _.toLowerCase()).filter((_) => _.length >= MIN_SEARCH_TEXT_LENGTH);
}
function transformEmojiData(emojiData) {
  const res = emojiData.map(({ annotation, emoticon, group, order, shortcodes, skins, tags, emoji, version }) => {
    const tokens = [...new Set(
      normalizeTokens([
        ...(shortcodes || []).map(extractTokens).flat(),
        ...tags.map(extractTokens).flat(),
        ...extractTokens(annotation),
        emoticon
      ])
    )].sort();
    const res2 = {
      annotation,
      group,
      order,
      tags,
      tokens,
      unicode: emoji,
      version
    };
    if (emoticon) {
      res2.emoticon = emoticon;
    }
    if (shortcodes) {
      res2.shortcodes = shortcodes;
    }
    if (skins) {
      res2.skinTones = [];
      res2.skinUnicodes = [];
      res2.skinVersions = [];
      for (const { tone, emoji: emoji2, version: version2 } of skins) {
        res2.skinTones.push(tone);
        res2.skinUnicodes.push(emoji2);
        res2.skinVersions.push(version2);
      }
    }
    return res2;
  });
  return res;
}
function callStore(store, method, key, cb) {
  store[method](key).onsuccess = (e) => cb && cb(e.target.result);
}
function getIDB(store, key, cb) {
  callStore(store, "get", key, cb);
}
function getAllIDB(store, key, cb) {
  callStore(store, "getAll", key, cb);
}
function commit(txn) {
  if (txn.commit) {
    txn.commit();
  }
}
function minBy(array, func) {
  let minItem = array[0];
  for (let i = 1; i < array.length; i++) {
    const item = array[i];
    if (func(minItem) > func(item)) {
      minItem = item;
    }
  }
  return minItem;
}
function findCommonMembers(arrays, uniqByFunc) {
  const shortestArray = minBy(arrays, (_) => _.length);
  const results = [];
  for (const item of shortestArray) {
    if (!arrays.some((array) => array.findIndex((_) => uniqByFunc(_) === uniqByFunc(item)) === -1)) {
      results.push(item);
    }
  }
  return results;
}
async function isEmpty(db) {
  return !await get(db, STORE_KEYVALUE, KEY_URL);
}
async function hasData(db, url, eTag) {
  const [oldETag, oldUrl] = await Promise.all([KEY_ETAG, KEY_URL].map((key) => get(db, STORE_KEYVALUE, key)));
  return oldETag === eTag && oldUrl === url;
}
async function doFullDatabaseScanForSingleResult(db, predicate) {
  const BATCH_SIZE = 50;
  return dbPromise(db, STORE_EMOJI, MODE_READONLY, (emojiStore, txn, cb) => {
    let lastKey;
    const processNextBatch = () => {
      emojiStore.getAll(lastKey && IDBKeyRange.lowerBound(lastKey, true), BATCH_SIZE).onsuccess = (e) => {
        const results = e.target.result;
        for (const result of results) {
          lastKey = result.unicode;
          if (predicate(result)) {
            return cb(result);
          }
        }
        if (results.length < BATCH_SIZE) {
          return cb();
        }
        processNextBatch();
      };
    };
    processNextBatch();
  });
}
async function loadData(db, emojiData, url, eTag) {
  try {
    const transformedData = transformEmojiData(emojiData);
    await dbPromise(db, [STORE_EMOJI, STORE_KEYVALUE], MODE_READWRITE, ([emojiStore, metaStore], txn) => {
      let oldETag;
      let oldUrl;
      let todo = 0;
      function checkFetched() {
        if (++todo === 2) {
          onFetched();
        }
      }
      function onFetched() {
        if (oldETag === eTag && oldUrl === url) {
          return;
        }
        emojiStore.clear();
        for (const data of transformedData) {
          emojiStore.put(data);
        }
        metaStore.put(eTag, KEY_ETAG);
        metaStore.put(url, KEY_URL);
        commit(txn);
      }
      getIDB(metaStore, KEY_ETAG, (result) => {
        oldETag = result;
        checkFetched();
      });
      getIDB(metaStore, KEY_URL, (result) => {
        oldUrl = result;
        checkFetched();
      });
    });
  } finally {
  }
}
async function getEmojiByGroup(db, group) {
  return dbPromise(db, STORE_EMOJI, MODE_READONLY, (emojiStore, txn, cb) => {
    const range = IDBKeyRange.bound([group, 0], [group + 1, 0], false, true);
    getAllIDB(emojiStore.index(INDEX_GROUP_AND_ORDER), range, cb);
  });
}
async function getEmojiBySearchQuery(db, query) {
  const tokens = normalizeTokens(extractTokens(query));
  if (!tokens.length) {
    return [];
  }
  return dbPromise(db, STORE_EMOJI, MODE_READONLY, (emojiStore, txn, cb) => {
    const intermediateResults = [];
    const checkDone = () => {
      if (intermediateResults.length === tokens.length) {
        onDone();
      }
    };
    const onDone = () => {
      const results = findCommonMembers(intermediateResults, (_) => _.unicode);
      cb(results.sort((a, b) => a.order < b.order ? -1 : 1));
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const range = i === tokens.length - 1 ? IDBKeyRange.bound(token, token + "\uFFFF", false, true) : IDBKeyRange.only(token);
      getAllIDB(emojiStore.index(INDEX_TOKENS), range, (result) => {
        intermediateResults.push(result);
        checkDone();
      });
    }
  });
}
async function getEmojiByShortcode(db, shortcode) {
  const emojis = await getEmojiBySearchQuery(db, shortcode);
  if (!emojis.length) {
    const predicate = (_) => (_.shortcodes || []).includes(shortcode.toLowerCase());
    return await doFullDatabaseScanForSingleResult(db, predicate) || null;
  }
  return emojis.filter((_) => {
    const lowerShortcodes = (_.shortcodes || []).map((_2) => _2.toLowerCase());
    return lowerShortcodes.includes(shortcode.toLowerCase());
  })[0] || null;
}
async function getEmojiByUnicode(db, unicode) {
  return dbPromise(db, STORE_EMOJI, MODE_READONLY, (emojiStore, txn, cb) => getIDB(emojiStore, unicode, (result) => {
    if (result) {
      return cb(result);
    }
    getIDB(emojiStore.index(INDEX_SKIN_UNICODE), unicode, (result2) => cb(result2 || null));
  }));
}
function get(db, storeName, key) {
  return dbPromise(db, storeName, MODE_READONLY, (store, txn, cb) => getIDB(store, key, cb));
}
function set(db, storeName, key, value) {
  return dbPromise(db, storeName, MODE_READWRITE, (store, txn) => {
    store.put(value, key);
    commit(txn);
  });
}
function incrementFavoriteEmojiCount(db, unicode) {
  return dbPromise(db, STORE_FAVORITES, MODE_READWRITE, (store, txn) => getIDB(store, unicode, (result) => {
    store.put((result || 0) + 1, unicode);
    commit(txn);
  }));
}
function getTopFavoriteEmoji(db, customEmojiIndex2, limit) {
  if (limit === 0) {
    return [];
  }
  return dbPromise(db, [STORE_FAVORITES, STORE_EMOJI], MODE_READONLY, ([favoritesStore, emojiStore], txn, cb) => {
    const results = [];
    favoritesStore.index(INDEX_COUNT).openCursor(void 0, "prev").onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        return cb(results);
      }
      function addResult(result) {
        results.push(result);
        if (results.length === limit) {
          return cb(results);
        }
        cursor.continue();
      }
      const unicodeOrName = cursor.primaryKey;
      const custom = customEmojiIndex2.byName(unicodeOrName);
      if (custom) {
        return addResult(custom);
      }
      getIDB(emojiStore, unicodeOrName, (emoji) => {
        if (emoji) {
          return addResult(emoji);
        }
        cursor.continue();
      });
    };
  });
}
var CODA_MARKER = "";
function trie(arr, itemToTokens) {
  const map = /* @__PURE__ */ new Map();
  for (const item of arr) {
    const tokens = itemToTokens(item);
    for (const token of tokens) {
      let currentMap = map;
      for (let i = 0; i < token.length; i++) {
        const char = token.charAt(i);
        let nextMap = currentMap.get(char);
        if (!nextMap) {
          nextMap = /* @__PURE__ */ new Map();
          currentMap.set(char, nextMap);
        }
        currentMap = nextMap;
      }
      let valuesAtCoda = currentMap.get(CODA_MARKER);
      if (!valuesAtCoda) {
        valuesAtCoda = [];
        currentMap.set(CODA_MARKER, valuesAtCoda);
      }
      valuesAtCoda.push(item);
    }
  }
  const search = (query, exact) => {
    let currentMap = map;
    for (let i = 0; i < query.length; i++) {
      const char = query.charAt(i);
      const nextMap = currentMap.get(char);
      if (nextMap) {
        currentMap = nextMap;
      } else {
        return [];
      }
    }
    if (exact) {
      const results2 = currentMap.get(CODA_MARKER);
      return results2 || [];
    }
    const results = [];
    const queue = [currentMap];
    while (queue.length) {
      const currentMap2 = queue.shift();
      const entriesSortedByKey = [...currentMap2.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
      for (const [key, value] of entriesSortedByKey) {
        if (key === CODA_MARKER) {
          results.push(...value);
        } else {
          queue.push(value);
        }
      }
    }
    return results;
  };
  return search;
}
var requiredKeys$1 = [
  "name",
  "url"
];
function assertCustomEmojis(customEmojis) {
  const isArray = customEmojis && Array.isArray(customEmojis);
  const firstItemIsFaulty = isArray && customEmojis.length && (!customEmojis[0] || requiredKeys$1.some((key) => !(key in customEmojis[0])));
  if (!isArray || firstItemIsFaulty) {
    throw new Error("Custom emojis are in the wrong format");
  }
}
function customEmojiIndex(customEmojis) {
  assertCustomEmojis(customEmojis);
  const sortByName = (a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
  const all = customEmojis.sort(sortByName);
  const emojiToTokens = (emoji) => [...new Set((emoji.shortcodes || []).map((shortcode) => extractTokens(shortcode)).flat())];
  const searchTrie = trie(customEmojis, emojiToTokens);
  const searchByExactMatch = (_) => searchTrie(_, true);
  const searchByPrefix = (_) => searchTrie(_, false);
  const search = (query) => {
    const tokens = extractTokens(query);
    const intermediateResults = tokens.map((token, i) => (i < tokens.length - 1 ? searchByExactMatch : searchByPrefix)(token));
    return findCommonMembers(intermediateResults, (_) => _.name).sort(sortByName);
  };
  const shortcodeToEmoji = /* @__PURE__ */ new Map();
  const nameToEmoji = /* @__PURE__ */ new Map();
  for (const customEmoji of customEmojis) {
    nameToEmoji.set(customEmoji.name.toLowerCase(), customEmoji);
    for (const shortcode of customEmoji.shortcodes || []) {
      shortcodeToEmoji.set(shortcode.toLowerCase(), customEmoji);
    }
  }
  const byShortcode = (shortcode) => shortcodeToEmoji.get(shortcode.toLowerCase());
  const byName = (name) => nameToEmoji.get(name.toLowerCase());
  return {
    all,
    search,
    byShortcode,
    byName
  };
}
var isFirefoxContentScript = typeof wrappedJSObject !== "undefined";
function cleanEmoji(emoji) {
  if (!emoji) {
    return emoji;
  }
  if (isFirefoxContentScript) {
    emoji = structuredClone(emoji);
  }
  delete emoji.tokens;
  if (emoji.skinTones) {
    const len = emoji.skinTones.length;
    emoji.skins = Array(len);
    for (let i = 0; i < len; i++) {
      emoji.skins[i] = {
        tone: emoji.skinTones[i],
        unicode: emoji.skinUnicodes[i],
        version: emoji.skinVersions[i]
      };
    }
    delete emoji.skinTones;
    delete emoji.skinUnicodes;
    delete emoji.skinVersions;
  }
  return emoji;
}
function warnETag(eTag) {
  if (!eTag) {
    console.warn("emoji-picker-element is more efficient if the dataSource server exposes an ETag header.");
  }
}
var requiredKeys = [
  "annotation",
  "emoji",
  "group",
  "order",
  "tags",
  "version"
];
function assertEmojiData(emojiData) {
  if (!emojiData || !Array.isArray(emojiData) || !emojiData[0] || typeof emojiData[0] !== "object" || requiredKeys.some((key) => !(key in emojiData[0]))) {
    throw new Error("Emoji data is in the wrong format");
  }
}
function assertStatus(response, dataSource) {
  if (Math.floor(response.status / 100) !== 2) {
    throw new Error("Failed to fetch: " + dataSource + ":  " + response.status);
  }
}
async function getETag(dataSource) {
  const response = await fetch(dataSource, { method: "HEAD" });
  assertStatus(response, dataSource);
  const eTag = response.headers.get("etag");
  warnETag(eTag);
  return eTag;
}
async function getETagAndData(dataSource) {
  const response = await fetch(dataSource);
  assertStatus(response, dataSource);
  const eTag = response.headers.get("etag");
  warnETag(eTag);
  const emojiData = await response.json();
  assertEmojiData(emojiData);
  return [eTag, emojiData];
}
function arrayBufferToBinaryString(buffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var length = bytes.byteLength;
  var i = -1;
  while (++i < length) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
}
function binaryStringToArrayBuffer(binary) {
  var length = binary.length;
  var buf = new ArrayBuffer(length);
  var arr = new Uint8Array(buf);
  var i = -1;
  while (++i < length) {
    arr[i] = binary.charCodeAt(i);
  }
  return buf;
}
async function jsonChecksum(object) {
  const inString = JSON.stringify(object);
  const inBuffer = binaryStringToArrayBuffer(inString);
  const outBuffer = await crypto.subtle.digest("SHA-1", inBuffer);
  const outBinString = arrayBufferToBinaryString(outBuffer);
  const res = btoa(outBinString);
  return res;
}
async function checkForUpdates(db, dataSource) {
  let emojiData;
  let eTag = await getETag(dataSource);
  if (!eTag) {
    const eTagAndData = await getETagAndData(dataSource);
    eTag = eTagAndData[0];
    emojiData = eTagAndData[1];
    if (!eTag) {
      eTag = await jsonChecksum(emojiData);
    }
  }
  if (await hasData(db, dataSource, eTag))
    ;
  else {
    if (!emojiData) {
      const eTagAndData = await getETagAndData(dataSource);
      emojiData = eTagAndData[1];
    }
    await loadData(db, emojiData, dataSource, eTag);
  }
}
async function loadDataForFirstTime(db, dataSource) {
  let [eTag, emojiData] = await getETagAndData(dataSource);
  if (!eTag) {
    eTag = await jsonChecksum(emojiData);
  }
  await loadData(db, emojiData, dataSource, eTag);
}
var Database = class {
  constructor({ dataSource = DEFAULT_DATA_SOURCE, locale = DEFAULT_LOCALE, customEmoji = [] } = {}) {
    this.dataSource = dataSource;
    this.locale = locale;
    this._dbName = `emoji-picker-element-${this.locale}`;
    this._db = void 0;
    this._lazyUpdate = void 0;
    this._custom = customEmojiIndex(customEmoji);
    this._clear = this._clear.bind(this);
    this._ready = this._init();
  }
  async _init() {
    const db = this._db = await openDatabase(this._dbName);
    addOnCloseListener(this._dbName, this._clear);
    const dataSource = this.dataSource;
    const empty = await isEmpty(db);
    if (empty) {
      await loadDataForFirstTime(db, dataSource);
    } else {
      this._lazyUpdate = checkForUpdates(db, dataSource);
    }
  }
  async ready() {
    const checkReady = async () => {
      if (!this._ready) {
        this._ready = this._init();
      }
      return this._ready;
    };
    await checkReady();
    if (!this._db) {
      await checkReady();
    }
  }
  async getEmojiByGroup(group) {
    assertNumber(group);
    await this.ready();
    return uniqEmoji(await getEmojiByGroup(this._db, group)).map(cleanEmoji);
  }
  async getEmojiBySearchQuery(query) {
    assertNonEmptyString(query);
    await this.ready();
    const customs = this._custom.search(query);
    const natives = uniqEmoji(await getEmojiBySearchQuery(this._db, query)).map(cleanEmoji);
    return [
      ...customs,
      ...natives
    ];
  }
  async getEmojiByShortcode(shortcode) {
    assertNonEmptyString(shortcode);
    await this.ready();
    const custom = this._custom.byShortcode(shortcode);
    if (custom) {
      return custom;
    }
    return cleanEmoji(await getEmojiByShortcode(this._db, shortcode));
  }
  async getEmojiByUnicodeOrName(unicodeOrName) {
    assertNonEmptyString(unicodeOrName);
    await this.ready();
    const custom = this._custom.byName(unicodeOrName);
    if (custom) {
      return custom;
    }
    return cleanEmoji(await getEmojiByUnicode(this._db, unicodeOrName));
  }
  async getPreferredSkinTone() {
    await this.ready();
    return await get(this._db, STORE_KEYVALUE, KEY_PREFERRED_SKINTONE) || 0;
  }
  async setPreferredSkinTone(skinTone) {
    assertNumber(skinTone);
    await this.ready();
    return set(this._db, STORE_KEYVALUE, KEY_PREFERRED_SKINTONE, skinTone);
  }
  async incrementFavoriteEmojiCount(unicodeOrName) {
    assertNonEmptyString(unicodeOrName);
    await this.ready();
    return incrementFavoriteEmojiCount(this._db, unicodeOrName);
  }
  async getTopFavoriteEmoji(limit) {
    assertNumber(limit);
    await this.ready();
    return (await getTopFavoriteEmoji(this._db, this._custom, limit)).map(cleanEmoji);
  }
  set customEmoji(customEmojis) {
    this._custom = customEmojiIndex(customEmojis);
  }
  get customEmoji() {
    return this._custom.all;
  }
  async _shutdown() {
    await this.ready();
    try {
      await this._lazyUpdate;
    } catch (err) {
    }
  }
  // clear references to IDB, e.g. during a close event
  _clear() {
    this._db = this._ready = this._lazyUpdate = void 0;
  }
  async close() {
    await this._shutdown();
    await closeDatabase(this._dbName);
  }
  async delete() {
    await this._shutdown();
    await deleteDatabase(this._dbName);
  }
};

// node_modules/emoji-picker-element/picker.js
function noop() {
}
function run(fn) {
  return fn();
}
function blank_object() {
  return /* @__PURE__ */ Object.create(null);
}
function run_all(fns) {
  fns.forEach(run);
}
function is_function(thing) {
  return typeof thing === "function";
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || a && typeof a === "object" || typeof a === "function";
}
var src_url_equal_anchor;
function src_url_equal(element_src, url) {
  if (element_src === url)
    return true;
  if (!src_url_equal_anchor) {
    src_url_equal_anchor = document.createElement("a");
  }
  src_url_equal_anchor.href = url;
  return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
  return Object.keys(obj).length === 0;
}
function action_destroyer(action_result) {
  return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
}
var globals = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : (
  // @ts-ignore Node typings have this
  global
);
function append(target, node) {
  target.appendChild(node);
}
function insert(target, node, anchor) {
  target.insertBefore(node, anchor || null);
}
function detach(node) {
  if (node.parentNode) {
    node.parentNode.removeChild(node);
  }
}
function element(name) {
  return document.createElement(name);
}
function text(data) {
  return document.createTextNode(data);
}
function listen(node, event, handler, options) {
  node.addEventListener(event, handler, options);
  return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
  if (value == null)
    node.removeAttribute(attribute);
  else if (node.getAttribute(attribute) !== value)
    node.setAttribute(attribute, value);
}
function set_data(text2, data) {
  data = "" + data;
  if (text2.data === data)
    return;
  text2.data = /** @type {string} */
  data;
}
function set_input_value(input, value) {
  input.value = value == null ? "" : value;
}
function set_style(node, key, value, important) {
  if (value == null) {
    node.style.removeProperty(key);
  } else {
    node.style.setProperty(key, value, important ? "important" : "");
  }
}
var current_component;
function set_current_component(component) {
  current_component = component;
}
var dirty_components = [];
var binding_callbacks = [];
var render_callbacks = [];
var flush_callbacks = [];
var resolved_promise = /* @__PURE__ */ Promise.resolve();
var update_scheduled = false;
function schedule_update() {
  if (!update_scheduled) {
    update_scheduled = true;
    resolved_promise.then(flush);
  }
}
function add_render_callback(fn) {
  render_callbacks.push(fn);
}
var seen_callbacks = /* @__PURE__ */ new Set();
var flushidx = 0;
function flush() {
  if (flushidx !== 0) {
    return;
  }
  const saved_component = current_component;
  do {
    try {
      while (flushidx < dirty_components.length) {
        const component = dirty_components[flushidx];
        flushidx++;
        set_current_component(component);
        update(component.$$);
      }
    } catch (e) {
      dirty_components.length = 0;
      flushidx = 0;
      throw e;
    }
    set_current_component(null);
    dirty_components.length = 0;
    flushidx = 0;
    while (binding_callbacks.length)
      binding_callbacks.pop()();
    for (let i = 0; i < render_callbacks.length; i += 1) {
      const callback = render_callbacks[i];
      if (!seen_callbacks.has(callback)) {
        seen_callbacks.add(callback);
        callback();
      }
    }
    render_callbacks.length = 0;
  } while (dirty_components.length);
  while (flush_callbacks.length) {
    flush_callbacks.pop()();
  }
  update_scheduled = false;
  seen_callbacks.clear();
  set_current_component(saved_component);
}
function update($$) {
  if ($$.fragment !== null) {
    $$.update();
    run_all($$.before_update);
    const dirty = $$.dirty;
    $$.dirty = [-1];
    $$.fragment && $$.fragment.p($$.ctx, dirty);
    $$.after_update.forEach(add_render_callback);
  }
}
function flush_render_callbacks(fns) {
  const filtered = [];
  const targets = [];
  render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
  targets.forEach((c) => c());
  render_callbacks = filtered;
}
var outroing = /* @__PURE__ */ new Set();
function transition_in(block, local) {
  if (block && block.i) {
    outroing.delete(block);
    block.i(local);
  }
}
function ensure_array_like(array_like_or_iterator) {
  return array_like_or_iterator && array_like_or_iterator.length !== void 0 ? array_like_or_iterator : Array.from(array_like_or_iterator);
}
function destroy_block(block, lookup) {
  block.d(1);
  lookup.delete(block.key);
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block2, next, get_context) {
  let o2 = old_blocks.length;
  let n2 = list.length;
  let i = o2;
  const old_indexes = {};
  while (i--)
    old_indexes[old_blocks[i].key] = i;
  const new_blocks = [];
  const new_lookup = /* @__PURE__ */ new Map();
  const deltas = /* @__PURE__ */ new Map();
  const updates = [];
  i = n2;
  while (i--) {
    const child_ctx = get_context(ctx, list, i);
    const key = get_key(child_ctx);
    let block = lookup.get(key);
    if (!block) {
      block = create_each_block2(key, child_ctx);
      block.c();
    } else if (dynamic) {
      updates.push(() => block.p(child_ctx, dirty));
    }
    new_lookup.set(key, new_blocks[i] = block);
    if (key in old_indexes)
      deltas.set(key, Math.abs(i - old_indexes[key]));
  }
  const will_move = /* @__PURE__ */ new Set();
  const did_move = /* @__PURE__ */ new Set();
  function insert2(block) {
    transition_in(block, 1);
    block.m(node, next);
    lookup.set(block.key, block);
    next = block.first;
    n2--;
  }
  while (o2 && n2) {
    const new_block = new_blocks[n2 - 1];
    const old_block = old_blocks[o2 - 1];
    const new_key = new_block.key;
    const old_key = old_block.key;
    if (new_block === old_block) {
      next = new_block.first;
      o2--;
      n2--;
    } else if (!new_lookup.has(old_key)) {
      destroy(old_block, lookup);
      o2--;
    } else if (!lookup.has(new_key) || will_move.has(new_key)) {
      insert2(new_block);
    } else if (did_move.has(old_key)) {
      o2--;
    } else if (deltas.get(new_key) > deltas.get(old_key)) {
      did_move.add(new_key);
      insert2(new_block);
    } else {
      will_move.add(old_key);
      o2--;
    }
  }
  while (o2--) {
    const old_block = old_blocks[o2];
    if (!new_lookup.has(old_block.key))
      destroy(old_block, lookup);
  }
  while (n2)
    insert2(new_blocks[n2 - 1]);
  run_all(updates);
  return new_blocks;
}
function mount_component(component, target, anchor) {
  const { fragment, after_update } = component.$$;
  fragment && fragment.m(target, anchor);
  add_render_callback(() => {
    const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
    if (component.$$.on_destroy) {
      component.$$.on_destroy.push(...new_on_destroy);
    } else {
      run_all(new_on_destroy);
    }
    component.$$.on_mount = [];
  });
  after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
  const $$ = component.$$;
  if ($$.fragment !== null) {
    flush_render_callbacks($$.after_update);
    run_all($$.on_destroy);
    $$.fragment && $$.fragment.d(detaching);
    $$.on_destroy = $$.fragment = null;
    $$.ctx = [];
  }
}
function make_dirty(component, i) {
  if (component.$$.dirty[0] === -1) {
    dirty_components.push(component);
    schedule_update();
    component.$$.dirty.fill(0);
  }
  component.$$.dirty[i / 31 | 0] |= 1 << i % 31;
}
function init(component, options, instance2, create_fragment2, not_equal, props, append_styles = null, dirty = [-1]) {
  const parent_component = current_component;
  set_current_component(component);
  const $$ = component.$$ = {
    fragment: null,
    ctx: [],
    // state
    props,
    update: noop,
    not_equal,
    bound: blank_object(),
    // lifecycle
    on_mount: [],
    on_destroy: [],
    on_disconnect: [],
    before_update: [],
    after_update: [],
    context: new Map(parent_component ? parent_component.$$.context : []),
    // everything else
    callbacks: blank_object(),
    dirty,
    skip_bound: false,
    root: options.target || parent_component.$$.root
  };
  append_styles && append_styles($$.root);
  let ready = false;
  $$.ctx = instance2 ? instance2(component, options.props || {}, (i, ret, ...rest) => {
    const value = rest.length ? rest[0] : ret;
    if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
      if (!$$.skip_bound && $$.bound[i])
        $$.bound[i](value);
      if (ready)
        make_dirty(component, i);
    }
    return ret;
  }) : [];
  $$.update();
  ready = true;
  run_all($$.before_update);
  $$.fragment = create_fragment2 ? create_fragment2($$.ctx) : false;
  if (options.target) {
    {
      $$.fragment && $$.fragment.c();
    }
    mount_component(component, options.target, void 0);
    flush();
  }
  set_current_component(parent_component);
}
var SvelteComponent = class {
  /**
   * ### PRIVATE API
   *
   * Do not use, may change at any time
   *
   * @type {any}
   */
  /**
   * ### PRIVATE API
   *
   * Do not use, may change at any time
   *
   * @type {any}
   */
  /** @returns {void} */
  $destroy() {
    destroy_component(this, 1);
    this.$destroy = noop;
  }
  /**
   * @template {Extract<keyof Events, string>} K
   * @param {K} type
   * @param {((e: Events[K]) => void) | null | undefined} callback
   * @returns {() => void}
   */
  $on(type, callback) {
    if (!is_function(callback)) {
      return noop;
    }
    const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
    callbacks.push(callback);
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1)
        callbacks.splice(index, 1);
    };
  }
  /**
   * @param {Partial<Props>} props
   * @returns {void}
   */
  $set(props) {
    if (this.$$set && !is_empty(props)) {
      this.$$.skip_bound = true;
      this.$$set(props);
      this.$$.skip_bound = false;
    }
  }
};
var allGroups = [
  [-1, "\u2728", "custom"],
  [0, "\u{1F600}", "smileys-emotion"],
  [1, "\u{1F44B}", "people-body"],
  [3, "\u{1F431}", "animals-nature"],
  [4, "\u{1F34E}", "food-drink"],
  [5, "\u{1F3E0}\uFE0F", "travel-places"],
  [6, "\u26BD", "activities"],
  [7, "\u{1F4DD}", "objects"],
  [8, "\u26D4\uFE0F", "symbols"],
  [9, "\u{1F3C1}", "flags"]
].map(([id, emoji, name]) => ({ id, emoji, name }));
var groups = allGroups.slice(1);
var customGroup = allGroups[0];
var MIN_SEARCH_TEXT_LENGTH2 = 2;
var NUM_SKIN_TONES = 6;
var rIC = typeof requestIdleCallback === "function" ? requestIdleCallback : setTimeout;
function hasZwj(emoji) {
  return emoji.unicode.includes("\u200D");
}
var versionsAndTestEmoji = {
  "\u{1FAE8}": 15.1,
  // shaking head, technically from v15 but see note above
  "\u{1FAE0}": 14,
  "\u{1F972}": 13.1,
  // smiling face with tear, technically from v13 but see note above
  "\u{1F97B}": 12.1,
  // sari, technically from v12 but see note above
  "\u{1F970}": 11,
  "\u{1F929}": 5,
  "\u{1F471}\u200D\u2640\uFE0F": 4,
  "\u{1F923}": 3,
  "\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F": 2,
  "\u{1F600}": 1,
  "\u{1F610}\uFE0F": 0.7,
  "\u{1F603}": 0.6
};
var TIMEOUT_BEFORE_LOADING_MESSAGE = 1e3;
var DEFAULT_SKIN_TONE_EMOJI = "\u{1F590}\uFE0F";
var DEFAULT_NUM_COLUMNS = 8;
var MOST_COMMONLY_USED_EMOJI = [
  "\u{1F60A}",
  "\u{1F612}",
  "\u2764\uFE0F",
  "\u{1F44D}\uFE0F",
  "\u{1F60D}",
  "\u{1F602}",
  "\u{1F62D}",
  "\u263A\uFE0F",
  "\u{1F614}",
  "\u{1F629}",
  "\u{1F60F}",
  "\u{1F495}",
  "\u{1F64C}",
  "\u{1F618}"
];
var FONT_FAMILY = '"Twemoji Mozilla","Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji","EmojiOne Color","Android Emoji",sans-serif';
var DEFAULT_CATEGORY_SORTING = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var getTextFeature = (text2, color) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "top";
  ctx.font = `100px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  ctx.scale(0.01, 0.01);
  ctx.fillText(text2, 0, 0);
  return ctx.getImageData(0, 0, 1, 1).data;
};
var compareFeatures = (feature1, feature2) => {
  const feature1Str = [...feature1].join(",");
  const feature2Str = [...feature2].join(",");
  return feature1Str === feature2Str && !feature1Str.startsWith("0,0,0,");
};
function testColorEmojiSupported(text2) {
  const feature1 = getTextFeature(text2, "#000");
  const feature2 = getTextFeature(text2, "#fff");
  return feature1 && feature2 && compareFeatures(feature1, feature2);
}
function determineEmojiSupportLevel() {
  const entries = Object.entries(versionsAndTestEmoji);
  try {
    for (const [emoji, version] of entries) {
      if (testColorEmojiSupported(emoji)) {
        return version;
      }
    }
  } catch (e) {
  } finally {
  }
  return entries[0][1];
}
var promise;
var detectEmojiSupportLevel = () => {
  if (!promise) {
    promise = new Promise((resolve) => rIC(() => resolve(determineEmojiSupportLevel())));
  }
  return promise;
};
var supportedZwjEmojis = /* @__PURE__ */ new Map();
var VARIATION_SELECTOR = "\uFE0F";
var SKINTONE_MODIFIER = "\uD83C";
var ZWJ = "\u200D";
var LIGHT_SKIN_TONE = 127995;
var LIGHT_SKIN_TONE_MODIFIER = 57339;
function applySkinTone(str, skinTone) {
  if (skinTone === 0) {
    return str;
  }
  const zwjIndex = str.indexOf(ZWJ);
  if (zwjIndex !== -1) {
    return str.substring(0, zwjIndex) + String.fromCodePoint(LIGHT_SKIN_TONE + skinTone - 1) + str.substring(zwjIndex);
  }
  if (str.endsWith(VARIATION_SELECTOR)) {
    str = str.substring(0, str.length - 1);
  }
  return str + SKINTONE_MODIFIER + String.fromCodePoint(LIGHT_SKIN_TONE_MODIFIER + skinTone - 1);
}
function halt(event) {
  event.preventDefault();
  event.stopPropagation();
}
function incrementOrDecrement(decrement, val, arr) {
  val += decrement ? -1 : 1;
  if (val < 0) {
    val = arr.length - 1;
  } else if (val >= arr.length) {
    val = 0;
  }
  return val;
}
function uniqBy2(arr, func) {
  const set2 = /* @__PURE__ */ new Set();
  const res = [];
  for (const item of arr) {
    const key = func(item);
    if (!set2.has(key)) {
      set2.add(key);
      res.push(item);
    }
  }
  return res;
}
function summarizeEmojisForUI(emojis, emojiSupportLevel) {
  const toSimpleSkinsMap = (skins) => {
    const res = {};
    for (const skin of skins) {
      if (typeof skin.tone === "number" && skin.version <= emojiSupportLevel) {
        res[skin.tone] = skin.unicode;
      }
    }
    return res;
  };
  return emojis.map(({ unicode, skins, shortcodes, url, name, category, annotation }) => ({
    unicode,
    name,
    shortcodes,
    url,
    category,
    annotation,
    id: unicode || name,
    skins: skins && toSimpleSkinsMap(skins)
  }));
}
var rAF = requestAnimationFrame;
var resizeObserverSupported = typeof ResizeObserver === "function";
function calculateWidth(node, onUpdate) {
  let resizeObserver;
  if (resizeObserverSupported) {
    resizeObserver = new ResizeObserver((entries) => onUpdate(entries[0].contentRect.width));
    resizeObserver.observe(node);
  } else {
    rAF(() => onUpdate(node.getBoundingClientRect().width));
  }
  return {
    destroy() {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    }
  };
}
function calculateTextWidth(node) {
  {
    const range = document.createRange();
    range.selectNode(node.firstChild);
    return range.getBoundingClientRect().width;
  }
}
var baselineEmojiWidth;
function checkZwjSupport(zwjEmojisToCheck, baselineEmoji, emojiToDomNode) {
  for (const emoji of zwjEmojisToCheck) {
    const domNode = emojiToDomNode(emoji);
    const emojiWidth = calculateTextWidth(domNode);
    if (typeof baselineEmojiWidth === "undefined") {
      baselineEmojiWidth = calculateTextWidth(baselineEmoji);
    }
    const supported = emojiWidth / 1.8 < baselineEmojiWidth;
    supportedZwjEmojis.set(emoji.unicode, supported);
  }
}
function uniq(arr) {
  return uniqBy2(arr, (_) => _);
}
function resetScrollTopIfPossible(element2) {
  if (element2) {
    element2.scrollTop = 0;
  }
}
var { Map: Map_1 } = globals;
function get_each_context(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[66] = list[i];
  child_ctx[68] = i;
  return child_ctx;
}
function get_each_context_1(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[69] = list[i];
  child_ctx[68] = i;
  return child_ctx;
}
function get_each_context_2(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[66] = list[i];
  child_ctx[68] = i;
  return child_ctx;
}
function get_each_context_3(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[72] = list[i];
  return child_ctx;
}
function get_each_context_4(ctx, list, i) {
  const child_ctx = ctx.slice();
  child_ctx[75] = list[i];
  child_ctx[68] = i;
  return child_ctx;
}
function create_each_block_4(key_1, ctx) {
  let div;
  let t_value = (
    /*skinTone*/
    ctx[75] + ""
  );
  let t;
  let div_id_value;
  let div_class_value;
  let div_aria_selected_value;
  let div_title_value;
  let div_aria_label_value;
  return {
    key: key_1,
    first: null,
    c() {
      div = element("div");
      t = text(t_value);
      attr(div, "id", div_id_value = "skintone-" + /*i*/
      ctx[68]);
      attr(div, "class", div_class_value = "emoji " + /*i*/
      (ctx[68] === /*activeSkinTone*/
      ctx[20] ? "active" : ""));
      attr(div, "aria-selected", div_aria_selected_value = /*i*/
      ctx[68] === /*activeSkinTone*/
      ctx[20]);
      attr(div, "role", "option");
      attr(div, "title", div_title_value = /*i18n*/
      ctx[0].skinTones[
        /*i*/
        ctx[68]
      ]);
      attr(div, "aria-label", div_aria_label_value = /*i18n*/
      ctx[0].skinTones[
        /*i*/
        ctx[68]
      ]);
      this.first = div;
    },
    m(target, anchor) {
      insert(target, div, anchor);
      append(div, t);
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (dirty[0] & /*skinTones*/
      512 && t_value !== (t_value = /*skinTone*/
      ctx[75] + ""))
        set_data(t, t_value);
      if (dirty[0] & /*skinTones*/
      512 && div_id_value !== (div_id_value = "skintone-" + /*i*/
      ctx[68])) {
        attr(div, "id", div_id_value);
      }
      if (dirty[0] & /*skinTones, activeSkinTone*/
      1049088 && div_class_value !== (div_class_value = "emoji " + /*i*/
      (ctx[68] === /*activeSkinTone*/
      ctx[20] ? "active" : ""))) {
        attr(div, "class", div_class_value);
      }
      if (dirty[0] & /*skinTones, activeSkinTone*/
      1049088 && div_aria_selected_value !== (div_aria_selected_value = /*i*/
      ctx[68] === /*activeSkinTone*/
      ctx[20])) {
        attr(div, "aria-selected", div_aria_selected_value);
      }
      if (dirty[0] & /*i18n, skinTones*/
      513 && div_title_value !== (div_title_value = /*i18n*/
      ctx[0].skinTones[
        /*i*/
        ctx[68]
      ])) {
        attr(div, "title", div_title_value);
      }
      if (dirty[0] & /*i18n, skinTones*/
      513 && div_aria_label_value !== (div_aria_label_value = /*i18n*/
      ctx[0].skinTones[
        /*i*/
        ctx[68]
      ])) {
        attr(div, "aria-label", div_aria_label_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div);
      }
    }
  };
}
function create_each_block_3(key_1, ctx) {
  let button;
  let div;
  let t_value = (
    /*group*/
    ctx[72].emoji + ""
  );
  let t;
  let button_aria_controls_value;
  let button_aria_label_value;
  let button_aria_selected_value;
  let button_title_value;
  let mounted;
  let dispose;
  function click_handler() {
    return (
      /*click_handler*/
      ctx[51](
        /*group*/
        ctx[72]
      )
    );
  }
  return {
    key: key_1,
    first: null,
    c() {
      button = element("button");
      div = element("div");
      t = text(t_value);
      attr(div, "class", "nav-emoji emoji");
      attr(button, "role", "tab");
      attr(button, "class", "nav-button");
      attr(button, "aria-controls", button_aria_controls_value = "tab-" + /*group*/
      ctx[72].id);
      attr(button, "aria-label", button_aria_label_value = /*i18n*/
      ctx[0].categories[
        /*group*/
        ctx[72].name
      ]);
      attr(button, "aria-selected", button_aria_selected_value = !/*searchMode*/
      ctx[4] && /*currentGroup*/
      ctx[13].id === /*group*/
      ctx[72].id);
      attr(button, "title", button_title_value = /*i18n*/
      ctx[0].categories[
        /*group*/
        ctx[72].name
      ]);
      this.first = button;
    },
    m(target, anchor) {
      insert(target, button, anchor);
      append(button, div);
      append(div, t);
      if (!mounted) {
        dispose = listen(button, "click", click_handler);
        mounted = true;
      }
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (dirty[0] & /*groups*/
      4096 && t_value !== (t_value = /*group*/
      ctx[72].emoji + ""))
        set_data(t, t_value);
      if (dirty[0] & /*groups*/
      4096 && button_aria_controls_value !== (button_aria_controls_value = "tab-" + /*group*/
      ctx[72].id)) {
        attr(button, "aria-controls", button_aria_controls_value);
      }
      if (dirty[0] & /*i18n, groups*/
      4097 && button_aria_label_value !== (button_aria_label_value = /*i18n*/
      ctx[0].categories[
        /*group*/
        ctx[72].name
      ])) {
        attr(button, "aria-label", button_aria_label_value);
      }
      if (dirty[0] & /*searchMode, currentGroup, groups*/
      12304 && button_aria_selected_value !== (button_aria_selected_value = !/*searchMode*/
      ctx[4] && /*currentGroup*/
      ctx[13].id === /*group*/
      ctx[72].id)) {
        attr(button, "aria-selected", button_aria_selected_value);
      }
      if (dirty[0] & /*i18n, groups*/
      4097 && button_title_value !== (button_title_value = /*i18n*/
      ctx[0].categories[
        /*group*/
        ctx[72].name
      ])) {
        attr(button, "title", button_title_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(button);
      }
      mounted = false;
      dispose();
    }
  };
}
function create_else_block_1(ctx) {
  let img;
  let img_src_value;
  return {
    c() {
      img = element("img");
      attr(img, "class", "custom-emoji");
      if (!src_url_equal(img.src, img_src_value = /*emoji*/
      ctx[66].url))
        attr(img, "src", img_src_value);
      attr(img, "alt", "");
      attr(img, "loading", "lazy");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && !src_url_equal(img.src, img_src_value = /*emoji*/
      ctx2[66].url)) {
        attr(img, "src", img_src_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(img);
      }
    }
  };
}
function create_if_block_1(ctx) {
  let t_value = (
    /*unicodeWithSkin*/
    ctx[27](
      /*emoji*/
      ctx[66],
      /*currentSkinTone*/
      ctx[8]
    ) + ""
  );
  let t;
  return {
    c() {
      t = text(t_value);
    },
    m(target, anchor) {
      insert(target, t, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*currentEmojisWithCategories, currentSkinTone*/
      33024 && t_value !== (t_value = /*unicodeWithSkin*/
      ctx2[27](
        /*emoji*/
        ctx2[66],
        /*currentSkinTone*/
        ctx2[8]
      ) + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(t);
      }
    }
  };
}
function create_each_block_2(key_1, ctx) {
  let button;
  let button_role_value;
  let button_aria_selected_value;
  let button_aria_label_value;
  let button_title_value;
  let button_class_value;
  let button_id_value;
  function select_block_type(ctx2, dirty) {
    if (
      /*emoji*/
      ctx2[66].unicode
    )
      return create_if_block_1;
    return create_else_block_1;
  }
  let current_block_type = select_block_type(ctx);
  let if_block = current_block_type(ctx);
  return {
    key: key_1,
    first: null,
    c() {
      button = element("button");
      if_block.c();
      attr(button, "role", button_role_value = /*searchMode*/
      ctx[4] ? "option" : "menuitem");
      attr(button, "aria-selected", button_aria_selected_value = /*searchMode*/
      ctx[4] ? (
        /*i*/
        ctx[68] == /*activeSearchItem*/
        ctx[5]
      ) : "");
      attr(button, "aria-label", button_aria_label_value = /*labelWithSkin*/
      ctx[28](
        /*emoji*/
        ctx[66],
        /*currentSkinTone*/
        ctx[8]
      ));
      attr(button, "title", button_title_value = /*titleForEmoji*/
      ctx[29](
        /*emoji*/
        ctx[66]
      ));
      attr(button, "class", button_class_value = "emoji " + /*searchMode*/
      (ctx[4] && /*i*/
      ctx[68] === /*activeSearchItem*/
      ctx[5] ? "active" : ""));
      attr(button, "id", button_id_value = "emo-" + /*emoji*/
      ctx[66].id);
      this.first = button;
    },
    m(target, anchor) {
      insert(target, button, anchor);
      if_block.m(button, null);
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
        if_block.p(ctx, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx);
        if (if_block) {
          if_block.c();
          if_block.m(button, null);
        }
      }
      if (dirty[0] & /*searchMode*/
      16 && button_role_value !== (button_role_value = /*searchMode*/
      ctx[4] ? "option" : "menuitem")) {
        attr(button, "role", button_role_value);
      }
      if (dirty[0] & /*searchMode, currentEmojisWithCategories, activeSearchItem*/
      32816 && button_aria_selected_value !== (button_aria_selected_value = /*searchMode*/
      ctx[4] ? (
        /*i*/
        ctx[68] == /*activeSearchItem*/
        ctx[5]
      ) : "")) {
        attr(button, "aria-selected", button_aria_selected_value);
      }
      if (dirty[0] & /*currentEmojisWithCategories, currentSkinTone*/
      33024 && button_aria_label_value !== (button_aria_label_value = /*labelWithSkin*/
      ctx[28](
        /*emoji*/
        ctx[66],
        /*currentSkinTone*/
        ctx[8]
      ))) {
        attr(button, "aria-label", button_aria_label_value);
      }
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && button_title_value !== (button_title_value = /*titleForEmoji*/
      ctx[29](
        /*emoji*/
        ctx[66]
      ))) {
        attr(button, "title", button_title_value);
      }
      if (dirty[0] & /*searchMode, currentEmojisWithCategories, activeSearchItem*/
      32816 && button_class_value !== (button_class_value = "emoji " + /*searchMode*/
      (ctx[4] && /*i*/
      ctx[68] === /*activeSearchItem*/
      ctx[5] ? "active" : ""))) {
        attr(button, "class", button_class_value);
      }
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && button_id_value !== (button_id_value = "emo-" + /*emoji*/
      ctx[66].id)) {
        attr(button, "id", button_id_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(button);
      }
      if_block.d();
    }
  };
}
function create_each_block_1(key_1, ctx) {
  let div0;
  let t_value = (
    /*searchMode*/
    (ctx[4] ? (
      /*i18n*/
      ctx[0].searchResultsLabel
    ) : (
      /*emojiWithCategory*/
      ctx[69].category ? (
        /*emojiWithCategory*/
        ctx[69].category
      ) : (
        /*currentEmojisWithCategories*/
        ctx[15].length > 1 ? (
          /*i18n*/
          ctx[0].categories.custom
        ) : (
          /*i18n*/
          ctx[0].categories[
            /*currentGroup*/
            ctx[13].name
          ]
        )
      )
    )) + ""
  );
  let t;
  let div0_id_value;
  let div0_class_value;
  let div1;
  let each_blocks = [];
  let each_1_lookup = new Map_1();
  let div1_role_value;
  let div1_aria_labelledby_value;
  let div1_id_value;
  let each_value_2 = ensure_array_like(
    /*emojiWithCategory*/
    ctx[69].emojis
  );
  const get_key = (ctx2) => (
    /*emoji*/
    ctx2[66].id
  );
  for (let i = 0; i < each_value_2.length; i += 1) {
    let child_ctx = get_each_context_2(ctx, each_value_2, i);
    let key = get_key(child_ctx);
    each_1_lookup.set(key, each_blocks[i] = create_each_block_2(key, child_ctx));
  }
  return {
    key: key_1,
    first: null,
    c() {
      div0 = element("div");
      t = text(t_value);
      div1 = element("div");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      attr(div0, "id", div0_id_value = "menu-label-" + /*i*/
      ctx[68]);
      attr(div0, "class", div0_class_value = "category " + /*currentEmojisWithCategories*/
      (ctx[15].length === 1 && /*currentEmojisWithCategories*/
      ctx[15][0].category === "" ? "gone" : ""));
      attr(div0, "aria-hidden", "true");
      attr(div1, "class", "emoji-menu");
      attr(div1, "role", div1_role_value = /*searchMode*/
      ctx[4] ? "listbox" : "menu");
      attr(div1, "aria-labelledby", div1_aria_labelledby_value = "menu-label-" + /*i*/
      ctx[68]);
      attr(div1, "id", div1_id_value = /*searchMode*/
      ctx[4] ? "search-results" : "");
      this.first = div0;
    },
    m(target, anchor) {
      insert(target, div0, anchor);
      append(div0, t);
      insert(target, div1, anchor);
      for (let i = 0; i < each_blocks.length; i += 1) {
        if (each_blocks[i]) {
          each_blocks[i].m(div1, null);
        }
      }
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (dirty[0] & /*searchMode, i18n, currentEmojisWithCategories, currentGroup*/
      40977 && t_value !== (t_value = /*searchMode*/
      (ctx[4] ? (
        /*i18n*/
        ctx[0].searchResultsLabel
      ) : (
        /*emojiWithCategory*/
        ctx[69].category ? (
          /*emojiWithCategory*/
          ctx[69].category
        ) : (
          /*currentEmojisWithCategories*/
          ctx[15].length > 1 ? (
            /*i18n*/
            ctx[0].categories.custom
          ) : (
            /*i18n*/
            ctx[0].categories[
              /*currentGroup*/
              ctx[13].name
            ]
          )
        )
      )) + ""))
        set_data(t, t_value);
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && div0_id_value !== (div0_id_value = "menu-label-" + /*i*/
      ctx[68])) {
        attr(div0, "id", div0_id_value);
      }
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && div0_class_value !== (div0_class_value = "category " + /*currentEmojisWithCategories*/
      (ctx[15].length === 1 && /*currentEmojisWithCategories*/
      ctx[15][0].category === "" ? "gone" : ""))) {
        attr(div0, "class", div0_class_value);
      }
      if (dirty[0] & /*searchMode, currentEmojisWithCategories, activeSearchItem, labelWithSkin, currentSkinTone, titleForEmoji, unicodeWithSkin*/
      939557168) {
        each_value_2 = ensure_array_like(
          /*emojiWithCategory*/
          ctx[69].emojis
        );
        each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_2, each_1_lookup, div1, destroy_block, create_each_block_2, null, get_each_context_2);
      }
      if (dirty[0] & /*searchMode*/
      16 && div1_role_value !== (div1_role_value = /*searchMode*/
      ctx[4] ? "listbox" : "menu")) {
        attr(div1, "role", div1_role_value);
      }
      if (dirty[0] & /*currentEmojisWithCategories*/
      32768 && div1_aria_labelledby_value !== (div1_aria_labelledby_value = "menu-label-" + /*i*/
      ctx[68])) {
        attr(div1, "aria-labelledby", div1_aria_labelledby_value);
      }
      if (dirty[0] & /*searchMode*/
      16 && div1_id_value !== (div1_id_value = /*searchMode*/
      ctx[4] ? "search-results" : "")) {
        attr(div1, "id", div1_id_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(div0);
        detach(div1);
      }
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }
    }
  };
}
function create_else_block(ctx) {
  let img;
  let img_src_value;
  return {
    c() {
      img = element("img");
      attr(img, "class", "custom-emoji");
      if (!src_url_equal(img.src, img_src_value = /*emoji*/
      ctx[66].url))
        attr(img, "src", img_src_value);
      attr(img, "alt", "");
      attr(img, "loading", "lazy");
    },
    m(target, anchor) {
      insert(target, img, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*currentFavorites*/
      1024 && !src_url_equal(img.src, img_src_value = /*emoji*/
      ctx2[66].url)) {
        attr(img, "src", img_src_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(img);
      }
    }
  };
}
function create_if_block(ctx) {
  let t_value = (
    /*unicodeWithSkin*/
    ctx[27](
      /*emoji*/
      ctx[66],
      /*currentSkinTone*/
      ctx[8]
    ) + ""
  );
  let t;
  return {
    c() {
      t = text(t_value);
    },
    m(target, anchor) {
      insert(target, t, anchor);
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*currentFavorites, currentSkinTone*/
      1280 && t_value !== (t_value = /*unicodeWithSkin*/
      ctx2[27](
        /*emoji*/
        ctx2[66],
        /*currentSkinTone*/
        ctx2[8]
      ) + ""))
        set_data(t, t_value);
    },
    d(detaching) {
      if (detaching) {
        detach(t);
      }
    }
  };
}
function create_each_block(key_1, ctx) {
  let button;
  let button_aria_label_value;
  let button_title_value;
  let button_id_value;
  function select_block_type_1(ctx2, dirty) {
    if (
      /*emoji*/
      ctx2[66].unicode
    )
      return create_if_block;
    return create_else_block;
  }
  let current_block_type = select_block_type_1(ctx);
  let if_block = current_block_type(ctx);
  return {
    key: key_1,
    first: null,
    c() {
      button = element("button");
      if_block.c();
      attr(button, "role", "menuitem");
      attr(button, "aria-label", button_aria_label_value = /*labelWithSkin*/
      ctx[28](
        /*emoji*/
        ctx[66],
        /*currentSkinTone*/
        ctx[8]
      ));
      attr(button, "title", button_title_value = /*titleForEmoji*/
      ctx[29](
        /*emoji*/
        ctx[66]
      ));
      attr(button, "class", "emoji");
      attr(button, "id", button_id_value = "fav-" + /*emoji*/
      ctx[66].id);
      this.first = button;
    },
    m(target, anchor) {
      insert(target, button, anchor);
      if_block.m(button, null);
    },
    p(new_ctx, dirty) {
      ctx = new_ctx;
      if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
        if_block.p(ctx, dirty);
      } else {
        if_block.d(1);
        if_block = current_block_type(ctx);
        if (if_block) {
          if_block.c();
          if_block.m(button, null);
        }
      }
      if (dirty[0] & /*currentFavorites, currentSkinTone*/
      1280 && button_aria_label_value !== (button_aria_label_value = /*labelWithSkin*/
      ctx[28](
        /*emoji*/
        ctx[66],
        /*currentSkinTone*/
        ctx[8]
      ))) {
        attr(button, "aria-label", button_aria_label_value);
      }
      if (dirty[0] & /*currentFavorites*/
      1024 && button_title_value !== (button_title_value = /*titleForEmoji*/
      ctx[29](
        /*emoji*/
        ctx[66]
      ))) {
        attr(button, "title", button_title_value);
      }
      if (dirty[0] & /*currentFavorites*/
      1024 && button_id_value !== (button_id_value = "fav-" + /*emoji*/
      ctx[66].id)) {
        attr(button, "id", button_id_value);
      }
    },
    d(detaching) {
      if (detaching) {
        detach(button);
      }
      if_block.d();
    }
  };
}
function create_fragment(ctx) {
  let section;
  let div0;
  let div4;
  let div1;
  let input;
  let input_placeholder_value;
  let input_aria_expanded_value;
  let input_aria_activedescendant_value;
  let label;
  let t0_value = (
    /*i18n*/
    ctx[0].searchLabel + ""
  );
  let t0;
  let span0;
  let t1_value = (
    /*i18n*/
    ctx[0].searchDescription + ""
  );
  let t1;
  let div2;
  let button0;
  let t2;
  let button0_class_value;
  let div2_class_value;
  let span1;
  let t3_value = (
    /*i18n*/
    ctx[0].skinToneDescription + ""
  );
  let t3;
  let div3;
  let each_blocks_3 = [];
  let each0_lookup = new Map_1();
  let div3_class_value;
  let div3_aria_label_value;
  let div3_aria_activedescendant_value;
  let div3_aria_hidden_value;
  let div5;
  let each_blocks_2 = [];
  let each1_lookup = new Map_1();
  let div5_aria_label_value;
  let div7;
  let div6;
  let div8;
  let t4;
  let div8_class_value;
  let div10;
  let div9;
  let each_blocks_1 = [];
  let each2_lookup = new Map_1();
  let div10_class_value;
  let div10_role_value;
  let div10_aria_label_value;
  let div10_id_value;
  let div11;
  let each_blocks = [];
  let each3_lookup = new Map_1();
  let div11_class_value;
  let div11_aria_label_value;
  let button1;
  let section_aria_label_value;
  let mounted;
  let dispose;
  let each_value_4 = ensure_array_like(
    /*skinTones*/
    ctx[9]
  );
  const get_key = (ctx2) => (
    /*skinTone*/
    ctx2[75]
  );
  for (let i = 0; i < each_value_4.length; i += 1) {
    let child_ctx = get_each_context_4(ctx, each_value_4, i);
    let key = get_key(child_ctx);
    each0_lookup.set(key, each_blocks_3[i] = create_each_block_4(key, child_ctx));
  }
  let each_value_3 = ensure_array_like(
    /*groups*/
    ctx[12]
  );
  const get_key_1 = (ctx2) => (
    /*group*/
    ctx2[72].id
  );
  for (let i = 0; i < each_value_3.length; i += 1) {
    let child_ctx = get_each_context_3(ctx, each_value_3, i);
    let key = get_key_1(child_ctx);
    each1_lookup.set(key, each_blocks_2[i] = create_each_block_3(key, child_ctx));
  }
  let each_value_1 = ensure_array_like(
    /*currentEmojisWithCategories*/
    ctx[15]
  );
  const get_key_2 = (ctx2) => (
    /*emojiWithCategory*/
    ctx2[69].category
  );
  for (let i = 0; i < each_value_1.length; i += 1) {
    let child_ctx = get_each_context_1(ctx, each_value_1, i);
    let key = get_key_2(child_ctx);
    each2_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
  }
  let each_value = ensure_array_like(
    /*currentFavorites*/
    ctx[10]
  );
  const get_key_3 = (ctx2) => (
    /*emoji*/
    ctx2[66].id
  );
  for (let i = 0; i < each_value.length; i += 1) {
    let child_ctx = get_each_context(ctx, each_value, i);
    let key = get_key_3(child_ctx);
    each3_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
  }
  return {
    c() {
      section = element("section");
      div0 = element("div");
      div4 = element("div");
      div1 = element("div");
      input = element("input");
      label = element("label");
      t0 = text(t0_value);
      span0 = element("span");
      t1 = text(t1_value);
      div2 = element("div");
      button0 = element("button");
      t2 = text(
        /*skinToneButtonText*/
        ctx[21]
      );
      span1 = element("span");
      t3 = text(t3_value);
      div3 = element("div");
      for (let i = 0; i < each_blocks_3.length; i += 1) {
        each_blocks_3[i].c();
      }
      div5 = element("div");
      for (let i = 0; i < each_blocks_2.length; i += 1) {
        each_blocks_2[i].c();
      }
      div7 = element("div");
      div6 = element("div");
      div8 = element("div");
      t4 = text(
        /*message*/
        ctx[18]
      );
      div10 = element("div");
      div9 = element("div");
      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].c();
      }
      div11 = element("div");
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].c();
      }
      button1 = element("button");
      button1.textContent = "\u{1F600}";
      attr(div0, "class", "pad-top");
      attr(input, "id", "search");
      attr(input, "class", "search");
      attr(input, "type", "search");
      attr(input, "role", "combobox");
      attr(input, "enterkeyhint", "search");
      attr(input, "placeholder", input_placeholder_value = /*i18n*/
      ctx[0].searchLabel);
      attr(input, "autocapitalize", "none");
      attr(input, "autocomplete", "off");
      attr(input, "spellcheck", "true");
      attr(input, "aria-expanded", input_aria_expanded_value = !!/*searchMode*/
      (ctx[4] && /*currentEmojis*/
      ctx[1].length));
      attr(input, "aria-controls", "search-results");
      attr(input, "aria-describedby", "search-description");
      attr(input, "aria-autocomplete", "list");
      attr(input, "aria-activedescendant", input_aria_activedescendant_value = /*activeSearchItemId*/
      ctx[26] ? `emo-${/*activeSearchItemId*/
      ctx[26]}` : "");
      attr(label, "class", "sr-only");
      attr(label, "for", "search");
      attr(span0, "id", "search-description");
      attr(span0, "class", "sr-only");
      attr(div1, "class", "search-wrapper");
      attr(button0, "id", "skintone-button");
      attr(button0, "class", button0_class_value = "emoji " + /*skinTonePickerExpanded*/
      (ctx[6] ? "hide-focus" : ""));
      attr(
        button0,
        "aria-label",
        /*skinToneButtonLabel*/
        ctx[23]
      );
      attr(
        button0,
        "title",
        /*skinToneButtonLabel*/
        ctx[23]
      );
      attr(button0, "aria-describedby", "skintone-description");
      attr(button0, "aria-haspopup", "listbox");
      attr(
        button0,
        "aria-expanded",
        /*skinTonePickerExpanded*/
        ctx[6]
      );
      attr(button0, "aria-controls", "skintone-list");
      attr(div2, "class", div2_class_value = "skintone-button-wrapper " + /*skinTonePickerExpandedAfterAnimation*/
      (ctx[19] ? "expanded" : ""));
      attr(span1, "id", "skintone-description");
      attr(span1, "class", "sr-only");
      attr(div3, "id", "skintone-list");
      attr(div3, "class", div3_class_value = "skintone-list hide-focus " + /*skinTonePickerExpanded*/
      (ctx[6] ? "" : "hidden no-animate"));
      set_style(div3, "transform", "translateY(" + /*skinTonePickerExpanded*/
      (ctx[6] ? 0 : "calc(-1 * var(--num-skintones) * var(--total-emoji-size))") + ")");
      attr(div3, "role", "listbox");
      attr(div3, "aria-label", div3_aria_label_value = /*i18n*/
      ctx[0].skinTonesLabel);
      attr(div3, "aria-activedescendant", div3_aria_activedescendant_value = "skintone-" + /*activeSkinTone*/
      ctx[20]);
      attr(div3, "aria-hidden", div3_aria_hidden_value = !/*skinTonePickerExpanded*/
      ctx[6]);
      attr(div3, "tabindex", "-1");
      attr(div4, "class", "search-row");
      attr(div5, "class", "nav");
      attr(div5, "role", "tablist");
      set_style(div5, "grid-template-columns", "repeat(" + /*groups*/
      ctx[12].length + ", 1fr)");
      attr(div5, "aria-label", div5_aria_label_value = /*i18n*/
      ctx[0].categoriesLabel);
      attr(div6, "class", "indicator");
      set_style(div6, "transform", "translateX(" + /*isRtl*/
      (ctx[24] ? -1 : 1) * /*currentGroupIndex*/
      ctx[11] * 100 + "%)");
      attr(div7, "class", "indicator-wrapper");
      attr(div8, "class", div8_class_value = "message " + /*message*/
      (ctx[18] ? "" : "gone"));
      attr(div8, "role", "alert");
      attr(div8, "aria-live", "polite");
      attr(div10, "class", div10_class_value = "tabpanel " + (!/*databaseLoaded*/
      ctx[14] || /*message*/
      ctx[18] ? "gone" : ""));
      attr(div10, "role", div10_role_value = /*searchMode*/
      ctx[4] ? "region" : "tabpanel");
      attr(div10, "aria-label", div10_aria_label_value = /*searchMode*/
      ctx[4] ? (
        /*i18n*/
        ctx[0].searchResultsLabel
      ) : (
        /*i18n*/
        ctx[0].categories[
          /*currentGroup*/
          ctx[13].name
        ]
      ));
      attr(div10, "id", div10_id_value = /*searchMode*/
      ctx[4] ? "" : `tab-${/*currentGroup*/
      ctx[13].id}`);
      attr(div10, "tabindex", "0");
      attr(div11, "class", div11_class_value = "favorites emoji-menu " + /*message*/
      (ctx[18] ? "gone" : ""));
      attr(div11, "role", "menu");
      attr(div11, "aria-label", div11_aria_label_value = /*i18n*/
      ctx[0].favoritesLabel);
      set_style(
        div11,
        "padding-inline-end",
        /*scrollbarWidth*/
        ctx[25] + "px"
      );
      attr(button1, "aria-hidden", "true");
      attr(button1, "tabindex", "-1");
      attr(button1, "class", "abs-pos hidden emoji");
      attr(section, "class", "picker");
      attr(section, "aria-label", section_aria_label_value = /*i18n*/
      ctx[0].regionLabel);
      attr(
        section,
        "style",
        /*pickerStyle*/
        ctx[22]
      );
    },
    m(target, anchor) {
      insert(target, section, anchor);
      append(section, div0);
      append(section, div4);
      append(div4, div1);
      append(div1, input);
      set_input_value(
        input,
        /*rawSearchText*/
        ctx[2]
      );
      append(div1, label);
      append(label, t0);
      append(div1, span0);
      append(span0, t1);
      append(div4, div2);
      append(div2, button0);
      append(button0, t2);
      append(div4, span1);
      append(span1, t3);
      append(div4, div3);
      for (let i = 0; i < each_blocks_3.length; i += 1) {
        if (each_blocks_3[i]) {
          each_blocks_3[i].m(div3, null);
        }
      }
      ctx[50](div3);
      append(section, div5);
      for (let i = 0; i < each_blocks_2.length; i += 1) {
        if (each_blocks_2[i]) {
          each_blocks_2[i].m(div5, null);
        }
      }
      append(section, div7);
      append(div7, div6);
      append(section, div8);
      append(div8, t4);
      append(section, div10);
      append(div10, div9);
      for (let i = 0; i < each_blocks_1.length; i += 1) {
        if (each_blocks_1[i]) {
          each_blocks_1[i].m(div9, null);
        }
      }
      ctx[52](div10);
      append(section, div11);
      for (let i = 0; i < each_blocks.length; i += 1) {
        if (each_blocks[i]) {
          each_blocks[i].m(div11, null);
        }
      }
      append(section, button1);
      ctx[53](button1);
      ctx[54](section);
      if (!mounted) {
        dispose = [
          listen(
            input,
            "input",
            /*input_input_handler*/
            ctx[49]
          ),
          listen(
            input,
            "keydown",
            /*onSearchKeydown*/
            ctx[31]
          ),
          listen(
            button0,
            "click",
            /*onClickSkinToneButton*/
            ctx[36]
          ),
          listen(
            div3,
            "focusout",
            /*onSkinToneOptionsFocusOut*/
            ctx[39]
          ),
          listen(
            div3,
            "click",
            /*onSkinToneOptionsClick*/
            ctx[35]
          ),
          listen(
            div3,
            "keydown",
            /*onSkinToneOptionsKeydown*/
            ctx[37]
          ),
          listen(
            div3,
            "keyup",
            /*onSkinToneOptionsKeyup*/
            ctx[38]
          ),
          listen(
            div5,
            "keydown",
            /*onNavKeydown*/
            ctx[33]
          ),
          action_destroyer(
            /*calculateEmojiGridStyle*/
            ctx[30].call(null, div9)
          ),
          listen(
            div10,
            "click",
            /*onEmojiClick*/
            ctx[34]
          ),
          listen(
            div11,
            "click",
            /*onEmojiClick*/
            ctx[34]
          )
        ];
        mounted = true;
      }
    },
    p(ctx2, dirty) {
      if (dirty[0] & /*i18n*/
      1 && input_placeholder_value !== (input_placeholder_value = /*i18n*/
      ctx2[0].searchLabel)) {
        attr(input, "placeholder", input_placeholder_value);
      }
      if (dirty[0] & /*searchMode, currentEmojis*/
      18 && input_aria_expanded_value !== (input_aria_expanded_value = !!/*searchMode*/
      (ctx2[4] && /*currentEmojis*/
      ctx2[1].length))) {
        attr(input, "aria-expanded", input_aria_expanded_value);
      }
      if (dirty[0] & /*activeSearchItemId*/
      67108864 && input_aria_activedescendant_value !== (input_aria_activedescendant_value = /*activeSearchItemId*/
      ctx2[26] ? `emo-${/*activeSearchItemId*/
      ctx2[26]}` : "")) {
        attr(input, "aria-activedescendant", input_aria_activedescendant_value);
      }
      if (dirty[0] & /*rawSearchText*/
      4 && input.value !== /*rawSearchText*/
      ctx2[2]) {
        set_input_value(
          input,
          /*rawSearchText*/
          ctx2[2]
        );
      }
      if (dirty[0] & /*i18n*/
      1 && t0_value !== (t0_value = /*i18n*/
      ctx2[0].searchLabel + ""))
        set_data(t0, t0_value);
      if (dirty[0] & /*i18n*/
      1 && t1_value !== (t1_value = /*i18n*/
      ctx2[0].searchDescription + ""))
        set_data(t1, t1_value);
      if (dirty[0] & /*skinToneButtonText*/
      2097152)
        set_data(
          t2,
          /*skinToneButtonText*/
          ctx2[21]
        );
      if (dirty[0] & /*skinTonePickerExpanded*/
      64 && button0_class_value !== (button0_class_value = "emoji " + /*skinTonePickerExpanded*/
      (ctx2[6] ? "hide-focus" : ""))) {
        attr(button0, "class", button0_class_value);
      }
      if (dirty[0] & /*skinToneButtonLabel*/
      8388608) {
        attr(
          button0,
          "aria-label",
          /*skinToneButtonLabel*/
          ctx2[23]
        );
      }
      if (dirty[0] & /*skinToneButtonLabel*/
      8388608) {
        attr(
          button0,
          "title",
          /*skinToneButtonLabel*/
          ctx2[23]
        );
      }
      if (dirty[0] & /*skinTonePickerExpanded*/
      64) {
        attr(
          button0,
          "aria-expanded",
          /*skinTonePickerExpanded*/
          ctx2[6]
        );
      }
      if (dirty[0] & /*skinTonePickerExpandedAfterAnimation*/
      524288 && div2_class_value !== (div2_class_value = "skintone-button-wrapper " + /*skinTonePickerExpandedAfterAnimation*/
      (ctx2[19] ? "expanded" : ""))) {
        attr(div2, "class", div2_class_value);
      }
      if (dirty[0] & /*i18n*/
      1 && t3_value !== (t3_value = /*i18n*/
      ctx2[0].skinToneDescription + ""))
        set_data(t3, t3_value);
      if (dirty[0] & /*skinTones, activeSkinTone, i18n*/
      1049089) {
        each_value_4 = ensure_array_like(
          /*skinTones*/
          ctx2[9]
        );
        each_blocks_3 = update_keyed_each(each_blocks_3, dirty, get_key, 1, ctx2, each_value_4, each0_lookup, div3, destroy_block, create_each_block_4, null, get_each_context_4);
      }
      if (dirty[0] & /*skinTonePickerExpanded*/
      64 && div3_class_value !== (div3_class_value = "skintone-list hide-focus " + /*skinTonePickerExpanded*/
      (ctx2[6] ? "" : "hidden no-animate"))) {
        attr(div3, "class", div3_class_value);
      }
      if (dirty[0] & /*skinTonePickerExpanded*/
      64) {
        set_style(div3, "transform", "translateY(" + /*skinTonePickerExpanded*/
        (ctx2[6] ? 0 : "calc(-1 * var(--num-skintones) * var(--total-emoji-size))") + ")");
      }
      if (dirty[0] & /*i18n*/
      1 && div3_aria_label_value !== (div3_aria_label_value = /*i18n*/
      ctx2[0].skinTonesLabel)) {
        attr(div3, "aria-label", div3_aria_label_value);
      }
      if (dirty[0] & /*activeSkinTone*/
      1048576 && div3_aria_activedescendant_value !== (div3_aria_activedescendant_value = "skintone-" + /*activeSkinTone*/
      ctx2[20])) {
        attr(div3, "aria-activedescendant", div3_aria_activedescendant_value);
      }
      if (dirty[0] & /*skinTonePickerExpanded*/
      64 && div3_aria_hidden_value !== (div3_aria_hidden_value = !/*skinTonePickerExpanded*/
      ctx2[6])) {
        attr(div3, "aria-hidden", div3_aria_hidden_value);
      }
      if (dirty[0] & /*groups, i18n, searchMode, currentGroup*/
      12305 | dirty[1] & /*onNavClick*/
      2) {
        each_value_3 = ensure_array_like(
          /*groups*/
          ctx2[12]
        );
        each_blocks_2 = update_keyed_each(each_blocks_2, dirty, get_key_1, 1, ctx2, each_value_3, each1_lookup, div5, destroy_block, create_each_block_3, null, get_each_context_3);
      }
      if (dirty[0] & /*groups*/
      4096) {
        set_style(div5, "grid-template-columns", "repeat(" + /*groups*/
        ctx2[12].length + ", 1fr)");
      }
      if (dirty[0] & /*i18n*/
      1 && div5_aria_label_value !== (div5_aria_label_value = /*i18n*/
      ctx2[0].categoriesLabel)) {
        attr(div5, "aria-label", div5_aria_label_value);
      }
      if (dirty[0] & /*isRtl, currentGroupIndex*/
      16779264) {
        set_style(div6, "transform", "translateX(" + /*isRtl*/
        (ctx2[24] ? -1 : 1) * /*currentGroupIndex*/
        ctx2[11] * 100 + "%)");
      }
      if (dirty[0] & /*message*/
      262144)
        set_data(
          t4,
          /*message*/
          ctx2[18]
        );
      if (dirty[0] & /*message*/
      262144 && div8_class_value !== (div8_class_value = "message " + /*message*/
      (ctx2[18] ? "" : "gone"))) {
        attr(div8, "class", div8_class_value);
      }
      if (dirty[0] & /*searchMode, currentEmojisWithCategories, activeSearchItem, labelWithSkin, currentSkinTone, titleForEmoji, unicodeWithSkin, i18n, currentGroup*/
      939565361) {
        each_value_1 = ensure_array_like(
          /*currentEmojisWithCategories*/
          ctx2[15]
        );
        each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key_2, 1, ctx2, each_value_1, each2_lookup, div9, destroy_block, create_each_block_1, null, get_each_context_1);
      }
      if (dirty[0] & /*databaseLoaded, message*/
      278528 && div10_class_value !== (div10_class_value = "tabpanel " + (!/*databaseLoaded*/
      ctx2[14] || /*message*/
      ctx2[18] ? "gone" : ""))) {
        attr(div10, "class", div10_class_value);
      }
      if (dirty[0] & /*searchMode*/
      16 && div10_role_value !== (div10_role_value = /*searchMode*/
      ctx2[4] ? "region" : "tabpanel")) {
        attr(div10, "role", div10_role_value);
      }
      if (dirty[0] & /*searchMode, i18n, currentGroup*/
      8209 && div10_aria_label_value !== (div10_aria_label_value = /*searchMode*/
      ctx2[4] ? (
        /*i18n*/
        ctx2[0].searchResultsLabel
      ) : (
        /*i18n*/
        ctx2[0].categories[
          /*currentGroup*/
          ctx2[13].name
        ]
      ))) {
        attr(div10, "aria-label", div10_aria_label_value);
      }
      if (dirty[0] & /*searchMode, currentGroup*/
      8208 && div10_id_value !== (div10_id_value = /*searchMode*/
      ctx2[4] ? "" : `tab-${/*currentGroup*/
      ctx2[13].id}`)) {
        attr(div10, "id", div10_id_value);
      }
      if (dirty[0] & /*labelWithSkin, currentFavorites, currentSkinTone, titleForEmoji, unicodeWithSkin*/
      939525376) {
        each_value = ensure_array_like(
          /*currentFavorites*/
          ctx2[10]
        );
        each_blocks = update_keyed_each(each_blocks, dirty, get_key_3, 1, ctx2, each_value, each3_lookup, div11, destroy_block, create_each_block, null, get_each_context);
      }
      if (dirty[0] & /*message*/
      262144 && div11_class_value !== (div11_class_value = "favorites emoji-menu " + /*message*/
      (ctx2[18] ? "gone" : ""))) {
        attr(div11, "class", div11_class_value);
      }
      if (dirty[0] & /*i18n*/
      1 && div11_aria_label_value !== (div11_aria_label_value = /*i18n*/
      ctx2[0].favoritesLabel)) {
        attr(div11, "aria-label", div11_aria_label_value);
      }
      if (dirty[0] & /*scrollbarWidth*/
      33554432) {
        set_style(
          div11,
          "padding-inline-end",
          /*scrollbarWidth*/
          ctx2[25] + "px"
        );
      }
      if (dirty[0] & /*i18n*/
      1 && section_aria_label_value !== (section_aria_label_value = /*i18n*/
      ctx2[0].regionLabel)) {
        attr(section, "aria-label", section_aria_label_value);
      }
      if (dirty[0] & /*pickerStyle*/
      4194304) {
        attr(
          section,
          "style",
          /*pickerStyle*/
          ctx2[22]
        );
      }
    },
    i: noop,
    o: noop,
    d(detaching) {
      if (detaching) {
        detach(section);
      }
      for (let i = 0; i < each_blocks_3.length; i += 1) {
        each_blocks_3[i].d();
      }
      ctx[50](null);
      for (let i = 0; i < each_blocks_2.length; i += 1) {
        each_blocks_2[i].d();
      }
      for (let i = 0; i < each_blocks_1.length; i += 1) {
        each_blocks_1[i].d();
      }
      ctx[52](null);
      for (let i = 0; i < each_blocks.length; i += 1) {
        each_blocks[i].d();
      }
      ctx[53](null);
      ctx[54](null);
      mounted = false;
      run_all(dispose);
    }
  };
}
function instance($$self, $$props, $$invalidate) {
  let { skinToneEmoji } = $$props;
  let { i18n } = $$props;
  let { database } = $$props;
  let { customEmoji } = $$props;
  let { customCategorySorting } = $$props;
  let { emojiVersion } = $$props;
  let initialLoad = true;
  let currentEmojis = [];
  let currentEmojisWithCategories = [];
  let rawSearchText = "";
  let searchText = "";
  let rootElement;
  let baselineEmoji;
  let tabpanelElement;
  let searchMode = false;
  let activeSearchItem = -1;
  let message;
  let skinTonePickerExpanded = false;
  let skinTonePickerExpandedAfterAnimation = false;
  let skinToneDropdown;
  let currentSkinTone = 0;
  let activeSkinTone = 0;
  let skinToneButtonText;
  let pickerStyle;
  let skinToneButtonLabel = "";
  let skinTones = [];
  let currentFavorites = [];
  let defaultFavoriteEmojis;
  let numColumns = DEFAULT_NUM_COLUMNS;
  let isRtl = false;
  let scrollbarWidth = 0;
  let currentGroupIndex = 0;
  let groups$1 = groups;
  let currentGroup;
  let databaseLoaded = false;
  let activeSearchItemId;
  const EMPTY_ARRAY = [];
  const focus = (id) => {
    rootElement.getRootNode().getElementById(id).focus();
  };
  const fireEvent = (name, detail) => {
    rootElement.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  };
  const unicodeWithSkin = (emoji, currentSkinTone2) => currentSkinTone2 && emoji.skins && emoji.skins[currentSkinTone2] || emoji.unicode;
  const labelWithSkin = (emoji, currentSkinTone2) => uniq([
    emoji.name || unicodeWithSkin(emoji, currentSkinTone2),
    emoji.annotation,
    ...emoji.shortcodes || EMPTY_ARRAY
  ].filter(Boolean)).join(", ");
  const titleForEmoji = (emoji) => emoji.annotation || (emoji.shortcodes || EMPTY_ARRAY).join(", ");
  function calculateEmojiGridStyle(node) {
    return calculateWidth(node, (width) => {
      if (true) {
        const style = getComputedStyle(rootElement);
        const newNumColumns = parseInt(style.getPropertyValue("--num-columns"), 10);
        const newIsRtl = style.getPropertyValue("direction") === "rtl";
        const parentWidth = node.parentElement.getBoundingClientRect().width;
        const newScrollbarWidth = parentWidth - width;
        $$invalidate(48, numColumns = newNumColumns);
        $$invalidate(25, scrollbarWidth = newScrollbarWidth);
        $$invalidate(24, isRtl = newIsRtl);
      }
    });
  }
  function checkZwjSupportAndUpdate(zwjEmojisToCheck) {
    const rootNode = rootElement.getRootNode();
    const emojiToDomNode = (emoji) => rootNode.getElementById(`emo-${emoji.id}`);
    checkZwjSupport(zwjEmojisToCheck, baselineEmoji, emojiToDomNode);
    $$invalidate(1, currentEmojis), $$invalidate(14, databaseLoaded), $$invalidate(46, searchText), $$invalidate(13, currentGroup), $$invalidate(44, emojiVersion), $$invalidate(3, tabpanelElement), $$invalidate(0, i18n), $$invalidate(40, database), $$invalidate(2, rawSearchText), $$invalidate(12, groups$1), $$invalidate(11, currentGroupIndex), $$invalidate(42, customEmoji);
  }
  function isZwjSupported(emoji) {
    return !emoji.unicode || !hasZwj(emoji) || supportedZwjEmojis.get(emoji.unicode);
  }
  async function filterEmojisByVersion(emojis) {
    const emojiSupportLevel = emojiVersion || await detectEmojiSupportLevel();
    return emojis.filter(({ version }) => !version || version <= emojiSupportLevel);
  }
  async function summarizeEmojis(emojis) {
    return summarizeEmojisForUI(emojis, emojiVersion || await detectEmojiSupportLevel());
  }
  async function getEmojisByGroup(group) {
    const emoji = group === -1 ? customEmoji : await database.getEmojiByGroup(group);
    return summarizeEmojis(await filterEmojisByVersion(emoji));
  }
  async function getEmojisBySearchQuery(query) {
    return summarizeEmojis(await filterEmojisByVersion(await database.getEmojiBySearchQuery(query)));
  }
  function onSearchKeydown(event) {
    if (!searchMode || !currentEmojis.length) {
      return;
    }
    const goToNextOrPrevious = (previous) => {
      halt(event);
      $$invalidate(5, activeSearchItem = incrementOrDecrement(previous, activeSearchItem, currentEmojis));
    };
    switch (event.key) {
      case "ArrowDown":
        return goToNextOrPrevious(false);
      case "ArrowUp":
        return goToNextOrPrevious(true);
      case "Enter":
        if (activeSearchItem !== -1) {
          halt(event);
          return clickEmoji(currentEmojis[activeSearchItem].id);
        } else if (currentEmojis.length) {
          $$invalidate(5, activeSearchItem = 0);
        }
    }
  }
  function onNavClick(group) {
    $$invalidate(2, rawSearchText = "");
    $$invalidate(46, searchText = "");
    $$invalidate(5, activeSearchItem = -1);
    $$invalidate(11, currentGroupIndex = groups$1.findIndex((_) => _.id === group.id));
  }
  function onNavKeydown(event) {
    const { target, key } = event;
    const doFocus = (el) => {
      if (el) {
        halt(event);
        el.focus();
      }
    };
    switch (key) {
      case "ArrowLeft":
        return doFocus(target.previousSibling);
      case "ArrowRight":
        return doFocus(target.nextSibling);
      case "Home":
        return doFocus(target.parentElement.firstChild);
      case "End":
        return doFocus(target.parentElement.lastChild);
    }
  }
  async function clickEmoji(unicodeOrName) {
    const emoji = await database.getEmojiByUnicodeOrName(unicodeOrName);
    const emojiSummary = [...currentEmojis, ...currentFavorites].find((_) => _.id === unicodeOrName);
    const skinTonedUnicode = emojiSummary.unicode && unicodeWithSkin(emojiSummary, currentSkinTone);
    await database.incrementFavoriteEmojiCount(unicodeOrName);
    fireEvent("emoji-click", {
      emoji,
      skinTone: currentSkinTone,
      ...skinTonedUnicode && { unicode: skinTonedUnicode },
      ...emojiSummary.name && { name: emojiSummary.name }
    });
  }
  async function onEmojiClick(event) {
    const { target } = event;
    if (!target.classList.contains("emoji")) {
      return;
    }
    halt(event);
    const id = target.id.substring(4);
    clickEmoji(id);
  }
  function changeSkinTone(skinTone) {
    $$invalidate(8, currentSkinTone = skinTone);
    $$invalidate(6, skinTonePickerExpanded = false);
    focus("skintone-button");
    fireEvent("skin-tone-change", { skinTone });
    database.setPreferredSkinTone(skinTone);
  }
  function onSkinToneOptionsClick(event) {
    const { target: { id } } = event;
    const match = id && id.match(/^skintone-(\d)/);
    if (!match) {
      return;
    }
    halt(event);
    const skinTone = parseInt(match[1], 10);
    changeSkinTone(skinTone);
  }
  function onClickSkinToneButton(event) {
    $$invalidate(6, skinTonePickerExpanded = !skinTonePickerExpanded);
    $$invalidate(20, activeSkinTone = currentSkinTone);
    if (skinTonePickerExpanded) {
      halt(event);
      rAF(() => focus("skintone-list"));
    }
  }
  function onSkinToneOptionsKeydown(event) {
    if (!skinTonePickerExpanded) {
      return;
    }
    const changeActiveSkinTone = async (nextSkinTone) => {
      halt(event);
      $$invalidate(20, activeSkinTone = nextSkinTone);
    };
    switch (event.key) {
      case "ArrowUp":
        return changeActiveSkinTone(incrementOrDecrement(true, activeSkinTone, skinTones));
      case "ArrowDown":
        return changeActiveSkinTone(incrementOrDecrement(false, activeSkinTone, skinTones));
      case "Home":
        return changeActiveSkinTone(0);
      case "End":
        return changeActiveSkinTone(skinTones.length - 1);
      case "Enter":
        halt(event);
        return changeSkinTone(activeSkinTone);
      case "Escape":
        halt(event);
        $$invalidate(6, skinTonePickerExpanded = false);
        return focus("skintone-button");
    }
  }
  function onSkinToneOptionsKeyup(event) {
    if (!skinTonePickerExpanded) {
      return;
    }
    switch (event.key) {
      case " ":
        halt(event);
        return changeSkinTone(activeSkinTone);
    }
  }
  async function onSkinToneOptionsFocusOut(event) {
    const { relatedTarget } = event;
    if (!relatedTarget || relatedTarget.id !== "skintone-list") {
      $$invalidate(6, skinTonePickerExpanded = false);
    }
  }
  function input_input_handler() {
    rawSearchText = this.value;
    $$invalidate(2, rawSearchText);
  }
  function div3_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      skinToneDropdown = $$value;
      $$invalidate(7, skinToneDropdown);
    });
  }
  const click_handler = (group) => onNavClick(group);
  function div10_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      tabpanelElement = $$value;
      $$invalidate(3, tabpanelElement);
    });
  }
  function button1_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      baselineEmoji = $$value;
      $$invalidate(17, baselineEmoji);
    });
  }
  function section_binding($$value) {
    binding_callbacks[$$value ? "unshift" : "push"](() => {
      rootElement = $$value;
      $$invalidate(16, rootElement);
    });
  }
  $$self.$$set = ($$props2) => {
    if ("skinToneEmoji" in $$props2)
      $$invalidate(41, skinToneEmoji = $$props2.skinToneEmoji);
    if ("i18n" in $$props2)
      $$invalidate(0, i18n = $$props2.i18n);
    if ("database" in $$props2)
      $$invalidate(40, database = $$props2.database);
    if ("customEmoji" in $$props2)
      $$invalidate(42, customEmoji = $$props2.customEmoji);
    if ("customCategorySorting" in $$props2)
      $$invalidate(43, customCategorySorting = $$props2.customCategorySorting);
    if ("emojiVersion" in $$props2)
      $$invalidate(44, emojiVersion = $$props2.emojiVersion);
  };
  $$self.$$.update = () => {
    if ($$self.$$.dirty[1] & /*customEmoji, database*/
    2560) {
      {
        if (customEmoji && database) {
          $$invalidate(40, database.customEmoji = customEmoji, database);
        }
      }
    }
    if ($$self.$$.dirty[0] & /*i18n*/
    1 | $$self.$$.dirty[1] & /*database*/
    512) {
      {
        async function handleDatabaseLoading() {
          let showingLoadingMessage = false;
          const timeoutHandle = setTimeout(
            () => {
              showingLoadingMessage = true;
              $$invalidate(18, message = i18n.loadingMessage);
            },
            TIMEOUT_BEFORE_LOADING_MESSAGE
          );
          try {
            await database.ready();
            $$invalidate(14, databaseLoaded = true);
          } catch (err) {
            console.error(err);
            $$invalidate(18, message = i18n.networkErrorMessage);
          } finally {
            clearTimeout(timeoutHandle);
            if (showingLoadingMessage) {
              showingLoadingMessage = false;
              $$invalidate(18, message = "");
            }
          }
        }
        if (database) {
          handleDatabaseLoading();
        }
      }
    }
    if ($$self.$$.dirty[0] & /*groups, currentGroupIndex*/
    6144 | $$self.$$.dirty[1] & /*customEmoji*/
    2048) {
      {
        if (customEmoji && customEmoji.length) {
          $$invalidate(12, groups$1 = [customGroup, ...groups]);
        } else if (groups$1 !== groups) {
          if (currentGroupIndex) {
            $$invalidate(11, currentGroupIndex--, currentGroupIndex);
          }
          $$invalidate(12, groups$1 = groups);
        }
      }
    }
    if ($$self.$$.dirty[0] & /*rawSearchText*/
    4) {
      {
        rIC(() => {
          $$invalidate(46, searchText = (rawSearchText || "").trim());
          $$invalidate(5, activeSearchItem = -1);
        });
      }
    }
    if ($$self.$$.dirty[0] & /*groups, currentGroupIndex*/
    6144) {
      $$invalidate(13, currentGroup = groups$1[currentGroupIndex]);
    }
    if ($$self.$$.dirty[0] & /*databaseLoaded, currentGroup*/
    24576 | $$self.$$.dirty[1] & /*searchText*/
    32768) {
      {
        async function updateEmojis() {
          if (!databaseLoaded) {
            $$invalidate(1, currentEmojis = []);
            $$invalidate(4, searchMode = false);
          } else if (searchText.length >= MIN_SEARCH_TEXT_LENGTH2) {
            const currentSearchText = searchText;
            const newEmojis = await getEmojisBySearchQuery(currentSearchText);
            if (currentSearchText === searchText) {
              $$invalidate(1, currentEmojis = newEmojis);
              $$invalidate(4, searchMode = true);
            }
          } else if (currentGroup) {
            const currentGroupId = currentGroup.id;
            const newEmojis = await getEmojisByGroup(currentGroupId);
            if (currentGroupId === currentGroup.id) {
              $$invalidate(1, currentEmojis = newEmojis);
              $$invalidate(4, searchMode = false);
            }
          }
        }
        updateEmojis();
      }
    }
    if ($$self.$$.dirty[0] & /*groups, searchMode*/
    4112) {
      $$invalidate(22, pickerStyle = `
  --num-groups: ${groups$1.length};
  --indicator-opacity: ${searchMode ? 0 : 1};
  --num-skintones: ${NUM_SKIN_TONES};`);
    }
    if ($$self.$$.dirty[0] & /*databaseLoaded*/
    16384 | $$self.$$.dirty[1] & /*database*/
    512) {
      {
        async function updatePreferredSkinTone() {
          if (databaseLoaded) {
            $$invalidate(8, currentSkinTone = await database.getPreferredSkinTone());
          }
        }
        updatePreferredSkinTone();
      }
    }
    if ($$self.$$.dirty[1] & /*skinToneEmoji*/
    1024) {
      $$invalidate(9, skinTones = Array(NUM_SKIN_TONES).fill().map((_, i) => applySkinTone(skinToneEmoji, i)));
    }
    if ($$self.$$.dirty[0] & /*skinTones, currentSkinTone*/
    768) {
      $$invalidate(21, skinToneButtonText = skinTones[currentSkinTone]);
    }
    if ($$self.$$.dirty[0] & /*i18n, currentSkinTone*/
    257) {
      $$invalidate(23, skinToneButtonLabel = i18n.skinToneLabel.replace("{skinTone}", i18n.skinTones[currentSkinTone]));
    }
    if ($$self.$$.dirty[0] & /*databaseLoaded*/
    16384 | $$self.$$.dirty[1] & /*database*/
    512) {
      {
        async function updateDefaultFavoriteEmojis() {
          $$invalidate(47, defaultFavoriteEmojis = (await Promise.all(MOST_COMMONLY_USED_EMOJI.map((unicode) => database.getEmojiByUnicodeOrName(unicode)))).filter(Boolean));
        }
        if (databaseLoaded) {
          updateDefaultFavoriteEmojis();
        }
      }
    }
    if ($$self.$$.dirty[0] & /*databaseLoaded*/
    16384 | $$self.$$.dirty[1] & /*database, numColumns, defaultFavoriteEmojis*/
    197120) {
      {
        async function updateFavorites() {
          const dbFavorites = await database.getTopFavoriteEmoji(numColumns);
          const favorites = await summarizeEmojis(uniqBy2([...dbFavorites, ...defaultFavoriteEmojis], (_) => _.unicode || _.name).slice(0, numColumns));
          $$invalidate(10, currentFavorites = favorites);
        }
        if (databaseLoaded && defaultFavoriteEmojis) {
          updateFavorites();
        }
      }
    }
    if ($$self.$$.dirty[0] & /*currentEmojis, tabpanelElement*/
    10 | $$self.$$.dirty[1] & /*emojiVersion*/
    8192) {
      {
        const zwjEmojisToCheck = currentEmojis.filter((emoji) => emoji.unicode).filter(
          (emoji) => hasZwj(emoji) && !supportedZwjEmojis.has(emoji.unicode)
        );
        if (!emojiVersion && zwjEmojisToCheck.length) {
          rAF(() => checkZwjSupportAndUpdate(zwjEmojisToCheck));
        } else {
          $$invalidate(1, currentEmojis = emojiVersion ? currentEmojis : currentEmojis.filter(isZwjSupported));
          rAF(() => resetScrollTopIfPossible(tabpanelElement));
        }
      }
    }
    if ($$self.$$.dirty[0] & /*currentEmojis, currentFavorites*/
    1026 | $$self.$$.dirty[1] & /*initialLoad*/
    16384) {
      {
        if (false) {
          if (currentEmojis.length && currentFavorites.length && initialLoad) {
            $$invalidate(45, initialLoad = false);
            requestPostAnimationFrame(() => void 0);
          }
        }
      }
    }
    if ($$self.$$.dirty[0] & /*searchMode, currentEmojis*/
    18 | $$self.$$.dirty[1] & /*customCategorySorting*/
    4096) {
      {
        let calculateCurrentEmojisWithCategories = function() {
          if (searchMode) {
            return [{ category: "", emojis: currentEmojis }];
          }
          const categoriesToEmoji = /* @__PURE__ */ new Map();
          for (const emoji of currentEmojis) {
            const category = emoji.category || "";
            let emojis = categoriesToEmoji.get(category);
            if (!emojis) {
              emojis = [];
              categoriesToEmoji.set(category, emojis);
            }
            emojis.push(emoji);
          }
          return [...categoriesToEmoji.entries()].map(([category, emojis]) => ({ category, emojis })).sort((a, b) => customCategorySorting(a.category, b.category));
        };
        $$invalidate(15, currentEmojisWithCategories = calculateCurrentEmojisWithCategories());
      }
    }
    if ($$self.$$.dirty[0] & /*activeSearchItem, currentEmojis*/
    34) {
      $$invalidate(26, activeSearchItemId = activeSearchItem !== -1 && currentEmojis[activeSearchItem].id);
    }
    if ($$self.$$.dirty[0] & /*skinTonePickerExpanded, skinToneDropdown*/
    192) {
      {
        if (skinTonePickerExpanded) {
          skinToneDropdown.addEventListener(
            "transitionend",
            () => {
              $$invalidate(19, skinTonePickerExpandedAfterAnimation = true);
            },
            { once: true }
          );
        } else {
          $$invalidate(19, skinTonePickerExpandedAfterAnimation = false);
        }
      }
    }
  };
  return [
    i18n,
    currentEmojis,
    rawSearchText,
    tabpanelElement,
    searchMode,
    activeSearchItem,
    skinTonePickerExpanded,
    skinToneDropdown,
    currentSkinTone,
    skinTones,
    currentFavorites,
    currentGroupIndex,
    groups$1,
    currentGroup,
    databaseLoaded,
    currentEmojisWithCategories,
    rootElement,
    baselineEmoji,
    message,
    skinTonePickerExpandedAfterAnimation,
    activeSkinTone,
    skinToneButtonText,
    pickerStyle,
    skinToneButtonLabel,
    isRtl,
    scrollbarWidth,
    activeSearchItemId,
    unicodeWithSkin,
    labelWithSkin,
    titleForEmoji,
    calculateEmojiGridStyle,
    onSearchKeydown,
    onNavClick,
    onNavKeydown,
    onEmojiClick,
    onSkinToneOptionsClick,
    onClickSkinToneButton,
    onSkinToneOptionsKeydown,
    onSkinToneOptionsKeyup,
    onSkinToneOptionsFocusOut,
    database,
    skinToneEmoji,
    customEmoji,
    customCategorySorting,
    emojiVersion,
    initialLoad,
    searchText,
    defaultFavoriteEmojis,
    numColumns,
    input_input_handler,
    div3_binding,
    click_handler,
    div10_binding,
    button1_binding,
    section_binding
  ];
}
var Picker = class extends SvelteComponent {
  constructor(options) {
    super();
    init(
      this,
      options,
      instance,
      create_fragment,
      safe_not_equal,
      {
        skinToneEmoji: 41,
        i18n: 0,
        database: 40,
        customEmoji: 42,
        customCategorySorting: 43,
        emojiVersion: 44
      },
      null,
      [-1, -1, -1]
    );
  }
};
var DEFAULT_DATA_SOURCE2 = "https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/emojibase/data.json";
var DEFAULT_LOCALE2 = "en";
var enI18n = {
  categoriesLabel: "Categories",
  emojiUnsupportedMessage: "Your browser does not support color emoji.",
  favoritesLabel: "Favorites",
  loadingMessage: "Loading\u2026",
  networkErrorMessage: "Could not load emoji.",
  regionLabel: "Emoji picker",
  searchDescription: "When search results are available, press up or down to select and enter to choose.",
  searchLabel: "Search",
  searchResultsLabel: "Search results",
  skinToneDescription: "When expanded, press up or down to select and enter to choose.",
  skinToneLabel: "Choose a skin tone (currently {skinTone})",
  skinTonesLabel: "Skin tones",
  skinTones: [
    "Default",
    "Light",
    "Medium-Light",
    "Medium",
    "Medium-Dark",
    "Dark"
  ],
  categories: {
    custom: "Custom",
    "smileys-emotion": "Smileys and emoticons",
    "people-body": "People and body",
    "animals-nature": "Animals and nature",
    "food-drink": "Food and drink",
    "travel-places": "Travel and places",
    activities: "Activities",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags"
  }
};
var PROPS = [
  "customEmoji",
  "customCategorySorting",
  "database",
  "dataSource",
  "i18n",
  "locale",
  "skinToneEmoji",
  "emojiVersion"
];
var EXTRA_STYLES = `:host{--emoji-font-family:${FONT_FAMILY}}`;
var PickerElement = class extends HTMLElement {
  constructor(props) {
    super();
    this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host{--emoji-size:1.375rem;--emoji-padding:0.5rem;--category-emoji-size:var(--emoji-size);--category-emoji-padding:var(--emoji-padding);--indicator-height:3px;--input-border-radius:0.5rem;--input-border-size:1px;--input-font-size:1rem;--input-line-height:1.5;--input-padding:0.25rem;--num-columns:8;--outline-size:2px;--border-size:1px;--skintone-border-radius:1rem;--category-font-size:1rem;display:flex;width:min-content;height:400px}:host,:host(.light){color-scheme:light;--background:#fff;--border-color:#e0e0e0;--indicator-color:#385ac1;--input-border-color:#999;--input-font-color:#111;--input-placeholder-color:#999;--outline-color:#999;--category-font-color:#111;--button-active-background:#e6e6e6;--button-hover-background:#d9d9d9}:host(.dark){color-scheme:dark;--background:#222;--border-color:#444;--indicator-color:#5373ec;--input-border-color:#ccc;--input-font-color:#efefef;--input-placeholder-color:#ccc;--outline-color:#fff;--category-font-color:#efefef;--button-active-background:#555555;--button-hover-background:#484848}@media (prefers-color-scheme:dark){:host{color-scheme:dark;--background:#222;--border-color:#444;--indicator-color:#5373ec;--input-border-color:#ccc;--input-font-color:#efefef;--input-placeholder-color:#ccc;--outline-color:#fff;--category-font-color:#efefef;--button-active-background:#555555;--button-hover-background:#484848}}:host([hidden]){display:none}button{margin:0;padding:0;border:0;background:0 0;box-shadow:none;-webkit-tap-highlight-color:transparent}button::-moz-focus-inner{border:0}input{padding:0;margin:0;line-height:1.15;font-family:inherit}input[type=search]{-webkit-appearance:none}:focus{outline:var(--outline-color) solid var(--outline-size);outline-offset:calc(-1*var(--outline-size))}:host([data-js-focus-visible]) :focus:not([data-focus-visible-added]){outline:0}:focus:not(:focus-visible){outline:0}.hide-focus{outline:0}*{box-sizing:border-box}.picker{contain:content;display:flex;flex-direction:column;background:var(--background);border:var(--border-size) solid var(--border-color);width:100%;height:100%;overflow:hidden;--total-emoji-size:calc(var(--emoji-size) + (2 * var(--emoji-padding)));--total-category-emoji-size:calc(var(--category-emoji-size) + (2 * var(--category-emoji-padding)))}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}.hidden{opacity:0;pointer-events:none}.abs-pos{position:absolute;left:0;top:0}.gone{display:none!important}.skintone-button-wrapper,.skintone-list{background:var(--background);z-index:3}.skintone-button-wrapper.expanded{z-index:1}.skintone-list{position:absolute;inset-inline-end:0;top:0;z-index:2;overflow:visible;border-bottom:var(--border-size) solid var(--border-color);border-radius:0 0 var(--skintone-border-radius) var(--skintone-border-radius);will-change:transform;transition:transform .2s ease-in-out;transform-origin:center 0}@media (prefers-reduced-motion:reduce){.skintone-list{transition-duration:.001s}}@supports not (inset-inline-end:0){.skintone-list{right:0}}.skintone-list.no-animate{transition:none}.tabpanel{overflow-y:auto;-webkit-overflow-scrolling:touch;will-change:transform;min-height:0;flex:1;contain:content}.emoji-menu{display:grid;grid-template-columns:repeat(var(--num-columns),var(--total-emoji-size));justify-content:space-around;align-items:flex-start;width:100%}.category{padding:var(--emoji-padding);font-size:var(--category-font-size);color:var(--category-font-color)}.custom-emoji,.emoji,button.emoji{height:var(--total-emoji-size);width:var(--total-emoji-size)}.emoji,button.emoji{font-size:var(--emoji-size);display:flex;align-items:center;justify-content:center;border-radius:100%;line-height:1;overflow:hidden;font-family:var(--emoji-font-family);cursor:pointer}@media (hover:hover) and (pointer:fine){.emoji:hover,button.emoji:hover{background:var(--button-hover-background)}}.emoji.active,.emoji:active,button.emoji.active,button.emoji:active{background:var(--button-active-background)}.custom-emoji{padding:var(--emoji-padding);object-fit:contain;pointer-events:none;background-repeat:no-repeat;background-position:center center;background-size:var(--emoji-size) var(--emoji-size)}.nav,.nav-button{align-items:center}.nav{display:grid;justify-content:space-between;contain:content}.nav-button{display:flex;justify-content:center}.nav-emoji{font-size:var(--category-emoji-size);width:var(--total-category-emoji-size);height:var(--total-category-emoji-size)}.indicator-wrapper{display:flex;border-bottom:1px solid var(--border-color)}.indicator{width:calc(100%/var(--num-groups));height:var(--indicator-height);opacity:var(--indicator-opacity);background-color:var(--indicator-color);will-change:transform,opacity;transition:opacity .1s linear,transform .25s ease-in-out}@media (prefers-reduced-motion:reduce){.indicator{will-change:opacity;transition:opacity .1s linear}}.pad-top,input.search{background:var(--background);width:100%}.pad-top{height:var(--emoji-padding);z-index:3}.search-row{display:flex;align-items:center;position:relative;padding-inline-start:var(--emoji-padding);padding-bottom:var(--emoji-padding)}.search-wrapper{flex:1;min-width:0}input.search{padding:var(--input-padding);border-radius:var(--input-border-radius);border:var(--input-border-size) solid var(--input-border-color);color:var(--input-font-color);font-size:var(--input-font-size);line-height:var(--input-line-height)}input.search::placeholder{color:var(--input-placeholder-color)}.favorites{display:flex;flex-direction:row;border-top:var(--border-size) solid var(--border-color);contain:content}.message{padding:var(--emoji-padding)}" + EXTRA_STYLES;
    this.shadowRoot.appendChild(style);
    this._ctx = {
      // Set defaults
      locale: DEFAULT_LOCALE2,
      dataSource: DEFAULT_DATA_SOURCE2,
      skinToneEmoji: DEFAULT_SKIN_TONE_EMOJI,
      customCategorySorting: DEFAULT_CATEGORY_SORTING,
      customEmoji: null,
      i18n: enI18n,
      emojiVersion: null,
      ...props
    };
    for (const prop of PROPS) {
      if (prop !== "database" && Object.prototype.hasOwnProperty.call(this, prop)) {
        this._ctx[prop] = this[prop];
        delete this[prop];
      }
    }
    this._dbFlush();
  }
  connectedCallback() {
    if (!this._cmp) {
      this._cmp = new Picker({
        target: this.shadowRoot,
        props: this._ctx
      });
    }
  }
  disconnectedCallback() {
    Promise.resolve().then(() => {
      if (!this.isConnected && this._cmp) {
        this._cmp.$destroy();
        this._cmp = void 0;
        const { database } = this._ctx;
        database.close().catch((err) => console.error(err));
      }
    });
  }
  static get observedAttributes() {
    return ["locale", "data-source", "skin-tone-emoji", "emoji-version"];
  }
  attributeChangedCallback(attrName, oldValue, newValue) {
    this._set(
      // convert from kebab-case to camelcase
      // see https://github.com/sveltejs/svelte/issues/3852#issuecomment-665037015
      attrName.replace(/-([a-z])/g, (_, up) => up.toUpperCase()),
      // convert string attribute to float if necessary
      attrName === "emoji-version" ? parseFloat(newValue) : newValue
    );
  }
  _set(prop, newValue) {
    this._ctx[prop] = newValue;
    if (this._cmp) {
      this._cmp.$set({ [prop]: newValue });
    }
    if (["locale", "dataSource"].includes(prop)) {
      this._dbFlush();
    }
  }
  _dbCreate() {
    const { locale, dataSource, database } = this._ctx;
    if (!database || database.locale !== locale || database.dataSource !== dataSource) {
      this._set("database", new Database({ locale, dataSource }));
    }
  }
  // Update the Database in one microtask if the locale/dataSource change. We do one microtask
  // so we don't create two Databases if e.g. both the locale and the dataSource change
  _dbFlush() {
    Promise.resolve().then(() => this._dbCreate());
  }
};
var definitions = {};
for (const prop of PROPS) {
  definitions[prop] = {
    get() {
      if (prop === "database") {
        this._dbCreate();
      }
      return this._ctx[prop];
    },
    set(val) {
      if (prop === "database") {
        throw new Error("database is read-only");
      }
      this._set(prop, val);
    }
  };
}
Object.defineProperties(PickerElement.prototype, definitions);
if (!customElements.get("emoji-picker")) {
  customElements.define("emoji-picker", PickerElement);
}

// node_modules/hello-goodbye/dist/hello-goodbye.js
function g(t) {
  t._currentTransition && (t.classList.remove(
    ...["active", "from", "to"].map(
      (r) => t._currentTransition + r
    )
  ), t._currentTransition = null);
}
async function f(t, r, a = {}) {
  const n2 = v(a) + r + "-", i = t.classList;
  g(t), t._currentTransition = n2, i.add(n2 + "active", n2 + "from"), await d(), i.add(n2 + "to"), i.remove(n2 + "from"), await m(t), i.remove(n2 + "to", n2 + "active"), t._currentTransition === n2 && (t._currentTransition = null);
}
function L(t, r = {}) {
  return f(t, "enter", r);
}
function x(t, r = {}) {
  return f(t, "leave", r);
}
function d() {
  return new Promise(
    (t) => requestAnimationFrame(() => requestAnimationFrame(() => t()))
  );
}
async function m(t) {
  if (getComputedStyle(t).transitionDuration.startsWith("0s"))
    return;
  let r = false;
  const a = () => r = true;
  if (t.addEventListener("transitionstart", a), await d(), t.removeEventListener("transitionstart", a), !!r)
    return new Promise((n2) => {
      const i = () => {
        n2(), t.removeEventListener("transitionend", i), t.removeEventListener("transitioncancel", i);
      };
      t.addEventListener("transitionend", i), t.addEventListener("transitioncancel", i);
    });
}
function v(t) {
  return t != null && t.prefix ? t.prefix + "-" : "";
}

// node_modules/inclusive-elements/dist/inclusive-elements11.js
function n(t) {
  return t.altKey || t.ctrlKey || t.metaKey || t.shiftKey || t.button !== void 0 && t.button !== 0;
}

// node_modules/tabbable/dist/index.esm.js
var candidateSelectors = ["input", "select", "textarea", "a[href]", "button", "[tabindex]:not(slot)", "audio[controls]", "video[controls]", '[contenteditable]:not([contenteditable="false"])', "details>summary:first-of-type", "details"];
var candidateSelector = /* @__PURE__ */ candidateSelectors.join(",");
var NoElement = typeof Element === "undefined";
var matches = NoElement ? function() {
} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
var getRootNode = !NoElement && Element.prototype.getRootNode ? function(element2) {
  return element2.getRootNode();
} : function(element2) {
  return element2.ownerDocument;
};
var getCandidates = function getCandidates2(el, includeContainer, filter) {
  var candidates = Array.prototype.slice.apply(el.querySelectorAll(candidateSelector));
  if (includeContainer && matches.call(el, candidateSelector)) {
    candidates.unshift(el);
  }
  candidates = candidates.filter(filter);
  return candidates;
};
var getCandidatesIteratively = function getCandidatesIteratively2(elements, includeContainer, options) {
  var candidates = [];
  var elementsToCheck = Array.from(elements);
  while (elementsToCheck.length) {
    var element2 = elementsToCheck.shift();
    if (element2.tagName === "SLOT") {
      var assigned = element2.assignedElements();
      var content = assigned.length ? assigned : element2.children;
      var nestedCandidates = getCandidatesIteratively2(content, true, options);
      if (options.flatten) {
        candidates.push.apply(candidates, nestedCandidates);
      } else {
        candidates.push({
          scope: element2,
          candidates: nestedCandidates
        });
      }
    } else {
      var validCandidate = matches.call(element2, candidateSelector);
      if (validCandidate && options.filter(element2) && (includeContainer || !elements.includes(element2))) {
        candidates.push(element2);
      }
      var shadowRoot = element2.shadowRoot || // check for an undisclosed shadow
      typeof options.getShadowRoot === "function" && options.getShadowRoot(element2);
      var validShadowRoot = !options.shadowRootFilter || options.shadowRootFilter(element2);
      if (shadowRoot && validShadowRoot) {
        var _nestedCandidates = getCandidatesIteratively2(shadowRoot === true ? element2.children : shadowRoot.children, true, options);
        if (options.flatten) {
          candidates.push.apply(candidates, _nestedCandidates);
        } else {
          candidates.push({
            scope: element2,
            candidates: _nestedCandidates
          });
        }
      } else {
        elementsToCheck.unshift.apply(elementsToCheck, element2.children);
      }
    }
  }
  return candidates;
};
var isInput = function isInput2(node) {
  return node.tagName === "INPUT";
};
var isHiddenInput = function isHiddenInput2(node) {
  return isInput(node) && node.type === "hidden";
};
var isDetailsWithSummary = function isDetailsWithSummary2(node) {
  var r = node.tagName === "DETAILS" && Array.prototype.slice.apply(node.children).some(function(child) {
    return child.tagName === "SUMMARY";
  });
  return r;
};
var isZeroArea = function isZeroArea2(node) {
  var _node$getBoundingClie = node.getBoundingClientRect(), width = _node$getBoundingClie.width, height = _node$getBoundingClie.height;
  return width === 0 && height === 0;
};
var isHidden = function isHidden2(node, _ref) {
  var displayCheck = _ref.displayCheck, getShadowRoot = _ref.getShadowRoot;
  if (getComputedStyle(node).visibility === "hidden") {
    return true;
  }
  var isDirectSummary = matches.call(node, "details>summary:first-of-type");
  var nodeUnderDetails = isDirectSummary ? node.parentElement : node;
  if (matches.call(nodeUnderDetails, "details:not([open]) *")) {
    return true;
  }
  var nodeRootHost = getRootNode(node).host;
  var nodeIsAttached = (nodeRootHost === null || nodeRootHost === void 0 ? void 0 : nodeRootHost.ownerDocument.contains(nodeRootHost)) || node.ownerDocument.contains(node);
  if (!displayCheck || displayCheck === "full") {
    if (typeof getShadowRoot === "function") {
      var originalNode = node;
      while (node) {
        var parentElement = node.parentElement;
        var rootNode = getRootNode(node);
        if (parentElement && !parentElement.shadowRoot && getShadowRoot(parentElement) === true) {
          return isZeroArea(node);
        } else if (node.assignedSlot) {
          node = node.assignedSlot;
        } else if (!parentElement && rootNode !== node.ownerDocument) {
          node = rootNode.host;
        } else {
          node = parentElement;
        }
      }
      node = originalNode;
    }
    if (nodeIsAttached) {
      return !node.getClientRects().length;
    }
  } else if (displayCheck === "non-zero-area") {
    return isZeroArea(node);
  }
  return false;
};
var isDisabledFromFieldset = function isDisabledFromFieldset2(node) {
  if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(node.tagName)) {
    var parentNode = node.parentElement;
    while (parentNode) {
      if (parentNode.tagName === "FIELDSET" && parentNode.disabled) {
        for (var i = 0; i < parentNode.children.length; i++) {
          var child = parentNode.children.item(i);
          if (child.tagName === "LEGEND") {
            return matches.call(parentNode, "fieldset[disabled] *") ? true : !child.contains(node);
          }
        }
        return true;
      }
      parentNode = parentNode.parentElement;
    }
  }
  return false;
};
var isNodeMatchingSelectorFocusable = function isNodeMatchingSelectorFocusable2(options, node) {
  if (node.disabled || isHiddenInput(node) || isHidden(node, options) || // For a details element with a summary, the summary element gets the focus
  isDetailsWithSummary(node) || isDisabledFromFieldset(node)) {
    return false;
  }
  return true;
};
var focusable = function focusable2(el, options) {
  options = options || {};
  var candidates;
  if (options.getShadowRoot) {
    candidates = getCandidatesIteratively([el], options.includeContainer, {
      filter: isNodeMatchingSelectorFocusable.bind(null, options),
      flatten: true,
      getShadowRoot: options.getShadowRoot
    });
  } else {
    candidates = getCandidates(el, options.includeContainer, isNodeMatchingSelectorFocusable.bind(null, options));
  }
  return candidates;
};

// node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
var min = Math.min;
var max = Math.max;
var round = Math.round;
var floor = Math.floor;
var createCoords = (v2) => ({
  x: v2,
  y: v2
});
var oppositeSideMap = {
  left: "right",
  right: "left",
  bottom: "top",
  top: "bottom"
};
var oppositeAlignmentMap = {
  start: "end",
  end: "start"
};
function clamp(start, value, end) {
  return max(start, min(value, end));
}
function evaluate(value, param) {
  return typeof value === "function" ? value(param) : value;
}
function getSide(placement) {
  return placement.split("-")[0];
}
function getAlignment(placement) {
  return placement.split("-")[1];
}
function getOppositeAxis(axis) {
  return axis === "x" ? "y" : "x";
}
function getAxisLength(axis) {
  return axis === "y" ? "height" : "width";
}
function getSideAxis(placement) {
  return ["top", "bottom"].includes(getSide(placement)) ? "y" : "x";
}
function getAlignmentAxis(placement) {
  return getOppositeAxis(getSideAxis(placement));
}
function getAlignmentSides(placement, rects, rtl) {
  if (rtl === void 0) {
    rtl = false;
  }
  const alignment = getAlignment(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const length = getAxisLength(alignmentAxis);
  let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
  if (rects.reference[length] > rects.floating[length]) {
    mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
  }
  return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
}
function getExpandedPlacements(placement) {
  const oppositePlacement = getOppositePlacement(placement);
  return [getOppositeAlignmentPlacement(placement), oppositePlacement, getOppositeAlignmentPlacement(oppositePlacement)];
}
function getOppositeAlignmentPlacement(placement) {
  return placement.replace(/start|end/g, (alignment) => oppositeAlignmentMap[alignment]);
}
function getSideList(side, isStart, rtl) {
  const lr = ["left", "right"];
  const rl = ["right", "left"];
  const tb = ["top", "bottom"];
  const bt = ["bottom", "top"];
  switch (side) {
    case "top":
    case "bottom":
      if (rtl)
        return isStart ? rl : lr;
      return isStart ? lr : rl;
    case "left":
    case "right":
      return isStart ? tb : bt;
    default:
      return [];
  }
}
function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
  const alignment = getAlignment(placement);
  let list = getSideList(getSide(placement), direction === "start", rtl);
  if (alignment) {
    list = list.map((side) => side + "-" + alignment);
    if (flipAlignment) {
      list = list.concat(list.map(getOppositeAlignmentPlacement));
    }
  }
  return list;
}
function getOppositePlacement(placement) {
  return placement.replace(/left|right|bottom|top/g, (side) => oppositeSideMap[side]);
}
function expandPaddingObject(padding) {
  return {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...padding
  };
}
function getPaddingObject(padding) {
  return typeof padding !== "number" ? expandPaddingObject(padding) : {
    top: padding,
    right: padding,
    bottom: padding,
    left: padding
  };
}
function rectToClientRect(rect) {
  return {
    ...rect,
    top: rect.y,
    left: rect.x,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height
  };
}

// node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function computeCoordsFromPlacement(_ref, placement, rtl) {
  let {
    reference,
    floating
  } = _ref;
  const sideAxis = getSideAxis(placement);
  const alignmentAxis = getAlignmentAxis(placement);
  const alignLength = getAxisLength(alignmentAxis);
  const side = getSide(placement);
  const isVertical = sideAxis === "y";
  const commonX = reference.x + reference.width / 2 - floating.width / 2;
  const commonY = reference.y + reference.height / 2 - floating.height / 2;
  const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
  let coords;
  switch (side) {
    case "top":
      coords = {
        x: commonX,
        y: reference.y - floating.height
      };
      break;
    case "bottom":
      coords = {
        x: commonX,
        y: reference.y + reference.height
      };
      break;
    case "right":
      coords = {
        x: reference.x + reference.width,
        y: commonY
      };
      break;
    case "left":
      coords = {
        x: reference.x - floating.width,
        y: commonY
      };
      break;
    default:
      coords = {
        x: reference.x,
        y: reference.y
      };
  }
  switch (getAlignment(placement)) {
    case "start":
      coords[alignmentAxis] -= commonAlign * (rtl && isVertical ? -1 : 1);
      break;
    case "end":
      coords[alignmentAxis] += commonAlign * (rtl && isVertical ? -1 : 1);
      break;
  }
  return coords;
}
var computePosition = async (reference, floating, config) => {
  const {
    placement = "bottom",
    strategy = "absolute",
    middleware = [],
    platform: platform2
  } = config;
  const validMiddleware = middleware.filter(Boolean);
  const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(floating));
  let rects = await platform2.getElementRects({
    reference,
    floating,
    strategy
  });
  let {
    x: x2,
    y
  } = computeCoordsFromPlacement(rects, placement, rtl);
  let statefulPlacement = placement;
  let middlewareData = {};
  let resetCount = 0;
  for (let i = 0; i < validMiddleware.length; i++) {
    const {
      name,
      fn
    } = validMiddleware[i];
    const {
      x: nextX,
      y: nextY,
      data,
      reset
    } = await fn({
      x: x2,
      y,
      initialPlacement: placement,
      placement: statefulPlacement,
      strategy,
      middlewareData,
      rects,
      platform: platform2,
      elements: {
        reference,
        floating
      }
    });
    x2 = nextX != null ? nextX : x2;
    y = nextY != null ? nextY : y;
    middlewareData = {
      ...middlewareData,
      [name]: {
        ...middlewareData[name],
        ...data
      }
    };
    if (reset && resetCount <= 50) {
      resetCount++;
      if (typeof reset === "object") {
        if (reset.placement) {
          statefulPlacement = reset.placement;
        }
        if (reset.rects) {
          rects = reset.rects === true ? await platform2.getElementRects({
            reference,
            floating,
            strategy
          }) : reset.rects;
        }
        ({
          x: x2,
          y
        } = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
      }
      i = -1;
      continue;
    }
  }
  return {
    x: x2,
    y,
    placement: statefulPlacement,
    strategy,
    middlewareData
  };
};
async function detectOverflow(state, options) {
  var _await$platform$isEle;
  if (options === void 0) {
    options = {};
  }
  const {
    x: x2,
    y,
    platform: platform2,
    rects,
    elements,
    strategy
  } = state;
  const {
    boundary = "clippingAncestors",
    rootBoundary = "viewport",
    elementContext = "floating",
    altBoundary = false,
    padding = 0
  } = evaluate(options, state);
  const paddingObject = getPaddingObject(padding);
  const altContext = elementContext === "floating" ? "reference" : "floating";
  const element2 = elements[altBoundary ? altContext : elementContext];
  const clippingClientRect = rectToClientRect(await platform2.getClippingRect({
    element: ((_await$platform$isEle = await (platform2.isElement == null ? void 0 : platform2.isElement(element2))) != null ? _await$platform$isEle : true) ? element2 : element2.contextElement || await (platform2.getDocumentElement == null ? void 0 : platform2.getDocumentElement(elements.floating)),
    boundary,
    rootBoundary,
    strategy
  }));
  const rect = elementContext === "floating" ? {
    ...rects.floating,
    x: x2,
    y
  } : rects.reference;
  const offsetParent = await (platform2.getOffsetParent == null ? void 0 : platform2.getOffsetParent(elements.floating));
  const offsetScale = await (platform2.isElement == null ? void 0 : platform2.isElement(offsetParent)) ? await (platform2.getScale == null ? void 0 : platform2.getScale(offsetParent)) || {
    x: 1,
    y: 1
  } : {
    x: 1,
    y: 1
  };
  const elementClientRect = rectToClientRect(platform2.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform2.convertOffsetParentRelativeRectToViewportRelativeRect({
    rect,
    offsetParent,
    strategy
  }) : rect);
  return {
    top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
    bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
    left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
    right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
  };
}
var flip = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "flip",
    options,
    async fn(state) {
      var _middlewareData$arrow, _middlewareData$flip;
      const {
        placement,
        middlewareData,
        rects,
        initialPlacement,
        platform: platform2,
        elements
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = true,
        fallbackPlacements: specifiedFallbackPlacements,
        fallbackStrategy = "bestFit",
        fallbackAxisSideDirection = "none",
        flipAlignment = true,
        ...detectOverflowOptions
      } = evaluate(options, state);
      if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) {
        return {};
      }
      const side = getSide(placement);
      const isBasePlacement = getSide(initialPlacement) === initialPlacement;
      const rtl = await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating));
      const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
      if (!specifiedFallbackPlacements && fallbackAxisSideDirection !== "none") {
        fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
      }
      const placements2 = [initialPlacement, ...fallbackPlacements];
      const overflow = await detectOverflow(state, detectOverflowOptions);
      const overflows = [];
      let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
      if (checkMainAxis) {
        overflows.push(overflow[side]);
      }
      if (checkCrossAxis) {
        const sides2 = getAlignmentSides(placement, rects, rtl);
        overflows.push(overflow[sides2[0]], overflow[sides2[1]]);
      }
      overflowsData = [...overflowsData, {
        placement,
        overflows
      }];
      if (!overflows.every((side2) => side2 <= 0)) {
        var _middlewareData$flip2, _overflowsData$filter;
        const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
        const nextPlacement = placements2[nextIndex];
        if (nextPlacement) {
          return {
            data: {
              index: nextIndex,
              overflows: overflowsData
            },
            reset: {
              placement: nextPlacement
            }
          };
        }
        let resetPlacement = (_overflowsData$filter = overflowsData.filter((d3) => d3.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
        if (!resetPlacement) {
          switch (fallbackStrategy) {
            case "bestFit": {
              var _overflowsData$map$so;
              const placement2 = (_overflowsData$map$so = overflowsData.map((d3) => [d3.placement, d3.overflows.filter((overflow2) => overflow2 > 0).reduce((acc, overflow2) => acc + overflow2, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$map$so[0];
              if (placement2) {
                resetPlacement = placement2;
              }
              break;
            }
            case "initialPlacement":
              resetPlacement = initialPlacement;
              break;
          }
        }
        if (placement !== resetPlacement) {
          return {
            reset: {
              placement: resetPlacement
            }
          };
        }
      }
      return {};
    }
  };
};
var shift = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "shift",
    options,
    async fn(state) {
      const {
        x: x2,
        y,
        placement
      } = state;
      const {
        mainAxis: checkMainAxis = true,
        crossAxis: checkCrossAxis = false,
        limiter = {
          fn: (_ref) => {
            let {
              x: x3,
              y: y2
            } = _ref;
            return {
              x: x3,
              y: y2
            };
          }
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const coords = {
        x: x2,
        y
      };
      const overflow = await detectOverflow(state, detectOverflowOptions);
      const crossAxis = getSideAxis(getSide(placement));
      const mainAxis = getOppositeAxis(crossAxis);
      let mainAxisCoord = coords[mainAxis];
      let crossAxisCoord = coords[crossAxis];
      if (checkMainAxis) {
        const minSide = mainAxis === "y" ? "top" : "left";
        const maxSide = mainAxis === "y" ? "bottom" : "right";
        const min2 = mainAxisCoord + overflow[minSide];
        const max2 = mainAxisCoord - overflow[maxSide];
        mainAxisCoord = clamp(min2, mainAxisCoord, max2);
      }
      if (checkCrossAxis) {
        const minSide = crossAxis === "y" ? "top" : "left";
        const maxSide = crossAxis === "y" ? "bottom" : "right";
        const min2 = crossAxisCoord + overflow[minSide];
        const max2 = crossAxisCoord - overflow[maxSide];
        crossAxisCoord = clamp(min2, crossAxisCoord, max2);
      }
      const limitedCoords = limiter.fn({
        ...state,
        [mainAxis]: mainAxisCoord,
        [crossAxis]: crossAxisCoord
      });
      return {
        ...limitedCoords,
        data: {
          x: limitedCoords.x - x2,
          y: limitedCoords.y - y
        }
      };
    }
  };
};
var size = function(options) {
  if (options === void 0) {
    options = {};
  }
  return {
    name: "size",
    options,
    async fn(state) {
      const {
        placement,
        rects,
        platform: platform2,
        elements
      } = state;
      const {
        apply = () => {
        },
        ...detectOverflowOptions
      } = evaluate(options, state);
      const overflow = await detectOverflow(state, detectOverflowOptions);
      const side = getSide(placement);
      const alignment = getAlignment(placement);
      const isYAxis = getSideAxis(placement) === "y";
      const {
        width,
        height
      } = rects.floating;
      let heightSide;
      let widthSide;
      if (side === "top" || side === "bottom") {
        heightSide = side;
        widthSide = alignment === (await (platform2.isRTL == null ? void 0 : platform2.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
      } else {
        widthSide = side;
        heightSide = alignment === "end" ? "top" : "bottom";
      }
      const overflowAvailableHeight = height - overflow[heightSide];
      const overflowAvailableWidth = width - overflow[widthSide];
      const noShift = !state.middlewareData.shift;
      let availableHeight = overflowAvailableHeight;
      let availableWidth = overflowAvailableWidth;
      if (isYAxis) {
        const maximumClippingWidth = width - overflow.left - overflow.right;
        availableWidth = alignment || noShift ? min(overflowAvailableWidth, maximumClippingWidth) : maximumClippingWidth;
      } else {
        const maximumClippingHeight = height - overflow.top - overflow.bottom;
        availableHeight = alignment || noShift ? min(overflowAvailableHeight, maximumClippingHeight) : maximumClippingHeight;
      }
      if (noShift && !alignment) {
        const xMin = max(overflow.left, 0);
        const xMax = max(overflow.right, 0);
        const yMin = max(overflow.top, 0);
        const yMax = max(overflow.bottom, 0);
        if (isYAxis) {
          availableWidth = width - 2 * (xMin !== 0 || xMax !== 0 ? xMin + xMax : max(overflow.left, overflow.right));
        } else {
          availableHeight = height - 2 * (yMin !== 0 || yMax !== 0 ? yMin + yMax : max(overflow.top, overflow.bottom));
        }
      }
      await apply({
        ...state,
        availableWidth,
        availableHeight
      });
      const nextDimensions = await platform2.getDimensions(elements.floating);
      if (width !== nextDimensions.width || height !== nextDimensions.height) {
        return {
          reset: {
            rects: true
          }
        };
      }
      return {};
    }
  };
};

// node_modules/@floating-ui/utils/dom/dist/floating-ui.utils.dom.mjs
function getNodeName(node) {
  if (isNode(node)) {
    return (node.nodeName || "").toLowerCase();
  }
  return "#document";
}
function getWindow(node) {
  var _node$ownerDocument;
  return (node == null ? void 0 : (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
}
function getDocumentElement(node) {
  var _ref;
  return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
}
function isNode(value) {
  return value instanceof Node || value instanceof getWindow(value).Node;
}
function isElement(value) {
  return value instanceof Element || value instanceof getWindow(value).Element;
}
function isHTMLElement(value) {
  return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
}
function isShadowRoot(value) {
  if (typeof ShadowRoot === "undefined") {
    return false;
  }
  return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
}
function isOverflowElement(element2) {
  const {
    overflow,
    overflowX,
    overflowY,
    display
  } = getComputedStyle2(element2);
  return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && !["inline", "contents"].includes(display);
}
function isTableElement(element2) {
  return ["table", "td", "th"].includes(getNodeName(element2));
}
function isContainingBlock(element2) {
  const webkit = isWebKit();
  const css = getComputedStyle2(element2);
  return css.transform !== "none" || css.perspective !== "none" || (css.containerType ? css.containerType !== "normal" : false) || !webkit && (css.backdropFilter ? css.backdropFilter !== "none" : false) || !webkit && (css.filter ? css.filter !== "none" : false) || ["transform", "perspective", "filter"].some((value) => (css.willChange || "").includes(value)) || ["paint", "layout", "strict", "content"].some((value) => (css.contain || "").includes(value));
}
function getContainingBlock(element2) {
  let currentNode = getParentNode(element2);
  while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
    if (isContainingBlock(currentNode)) {
      return currentNode;
    } else {
      currentNode = getParentNode(currentNode);
    }
  }
  return null;
}
function isWebKit() {
  if (typeof CSS === "undefined" || !CSS.supports)
    return false;
  return CSS.supports("-webkit-backdrop-filter", "none");
}
function isLastTraversableNode(node) {
  return ["html", "body", "#document"].includes(getNodeName(node));
}
function getComputedStyle2(element2) {
  return getWindow(element2).getComputedStyle(element2);
}
function getNodeScroll(element2) {
  if (isElement(element2)) {
    return {
      scrollLeft: element2.scrollLeft,
      scrollTop: element2.scrollTop
    };
  }
  return {
    scrollLeft: element2.pageXOffset,
    scrollTop: element2.pageYOffset
  };
}
function getParentNode(node) {
  if (getNodeName(node) === "html") {
    return node;
  }
  const result = (
    // Step into the shadow DOM of the parent of a slotted node.
    node.assignedSlot || // DOM Element detected.
    node.parentNode || // ShadowRoot detected.
    isShadowRoot(node) && node.host || // Fallback.
    getDocumentElement(node)
  );
  return isShadowRoot(result) ? result.host : result;
}
function getNearestOverflowAncestor(node) {
  const parentNode = getParentNode(node);
  if (isLastTraversableNode(parentNode)) {
    return node.ownerDocument ? node.ownerDocument.body : node.body;
  }
  if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) {
    return parentNode;
  }
  return getNearestOverflowAncestor(parentNode);
}
function getOverflowAncestors(node, list, traverseIframes) {
  var _node$ownerDocument2;
  if (list === void 0) {
    list = [];
  }
  if (traverseIframes === void 0) {
    traverseIframes = true;
  }
  const scrollableAncestor = getNearestOverflowAncestor(node);
  const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
  const win = getWindow(scrollableAncestor);
  if (isBody) {
    return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], win.frameElement && traverseIframes ? getOverflowAncestors(win.frameElement) : []);
  }
  return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
}

// node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function getCssDimensions(element2) {
  const css = getComputedStyle2(element2);
  let width = parseFloat(css.width) || 0;
  let height = parseFloat(css.height) || 0;
  const hasOffset = isHTMLElement(element2);
  const offsetWidth = hasOffset ? element2.offsetWidth : width;
  const offsetHeight = hasOffset ? element2.offsetHeight : height;
  const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
  if (shouldFallback) {
    width = offsetWidth;
    height = offsetHeight;
  }
  return {
    width,
    height,
    $: shouldFallback
  };
}
function unwrapElement(element2) {
  return !isElement(element2) ? element2.contextElement : element2;
}
function getScale(element2) {
  const domElement = unwrapElement(element2);
  if (!isHTMLElement(domElement)) {
    return createCoords(1);
  }
  const rect = domElement.getBoundingClientRect();
  const {
    width,
    height,
    $
  } = getCssDimensions(domElement);
  let x2 = ($ ? round(rect.width) : rect.width) / width;
  let y = ($ ? round(rect.height) : rect.height) / height;
  if (!x2 || !Number.isFinite(x2)) {
    x2 = 1;
  }
  if (!y || !Number.isFinite(y)) {
    y = 1;
  }
  return {
    x: x2,
    y
  };
}
var noOffsets = /* @__PURE__ */ createCoords(0);
function getVisualOffsets(element2) {
  const win = getWindow(element2);
  if (!isWebKit() || !win.visualViewport) {
    return noOffsets;
  }
  return {
    x: win.visualViewport.offsetLeft,
    y: win.visualViewport.offsetTop
  };
}
function shouldAddVisualOffsets(element2, isFixed, floatingOffsetParent) {
  if (isFixed === void 0) {
    isFixed = false;
  }
  if (!floatingOffsetParent || isFixed && floatingOffsetParent !== getWindow(element2)) {
    return false;
  }
  return isFixed;
}
function getBoundingClientRect(element2, includeScale, isFixedStrategy, offsetParent) {
  if (includeScale === void 0) {
    includeScale = false;
  }
  if (isFixedStrategy === void 0) {
    isFixedStrategy = false;
  }
  const clientRect = element2.getBoundingClientRect();
  const domElement = unwrapElement(element2);
  let scale = createCoords(1);
  if (includeScale) {
    if (offsetParent) {
      if (isElement(offsetParent)) {
        scale = getScale(offsetParent);
      }
    } else {
      scale = getScale(element2);
    }
  }
  const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
  let x2 = (clientRect.left + visualOffsets.x) / scale.x;
  let y = (clientRect.top + visualOffsets.y) / scale.y;
  let width = clientRect.width / scale.x;
  let height = clientRect.height / scale.y;
  if (domElement) {
    const win = getWindow(domElement);
    const offsetWin = offsetParent && isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
    let currentIFrame = win.frameElement;
    while (currentIFrame && offsetParent && offsetWin !== win) {
      const iframeScale = getScale(currentIFrame);
      const iframeRect = currentIFrame.getBoundingClientRect();
      const css = getComputedStyle2(currentIFrame);
      const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
      const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
      x2 *= iframeScale.x;
      y *= iframeScale.y;
      width *= iframeScale.x;
      height *= iframeScale.y;
      x2 += left;
      y += top;
      currentIFrame = getWindow(currentIFrame).frameElement;
    }
  }
  return rectToClientRect({
    width,
    height,
    x: x2,
    y
  });
}
function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
  let {
    rect,
    offsetParent,
    strategy
  } = _ref;
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  const documentElement = getDocumentElement(offsetParent);
  if (offsetParent === documentElement) {
    return rect;
  }
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  let scale = createCoords(1);
  const offsets = createCoords(0);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && strategy !== "fixed") {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isHTMLElement(offsetParent)) {
      const offsetRect = getBoundingClientRect(offsetParent);
      scale = getScale(offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    }
  }
  return {
    width: rect.width * scale.x,
    height: rect.height * scale.y,
    x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x,
    y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y
  };
}
function getClientRects(element2) {
  return Array.from(element2.getClientRects());
}
function getWindowScrollBarX(element2) {
  return getBoundingClientRect(getDocumentElement(element2)).left + getNodeScroll(element2).scrollLeft;
}
function getDocumentRect(element2) {
  const html = getDocumentElement(element2);
  const scroll = getNodeScroll(element2);
  const body = element2.ownerDocument.body;
  const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
  const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
  let x2 = -scroll.scrollLeft + getWindowScrollBarX(element2);
  const y = -scroll.scrollTop;
  if (getComputedStyle2(body).direction === "rtl") {
    x2 += max(html.clientWidth, body.clientWidth) - width;
  }
  return {
    width,
    height,
    x: x2,
    y
  };
}
function getViewportRect(element2, strategy) {
  const win = getWindow(element2);
  const html = getDocumentElement(element2);
  const visualViewport = win.visualViewport;
  let width = html.clientWidth;
  let height = html.clientHeight;
  let x2 = 0;
  let y = 0;
  if (visualViewport) {
    width = visualViewport.width;
    height = visualViewport.height;
    const visualViewportBased = isWebKit();
    if (!visualViewportBased || visualViewportBased && strategy === "fixed") {
      x2 = visualViewport.offsetLeft;
      y = visualViewport.offsetTop;
    }
  }
  return {
    width,
    height,
    x: x2,
    y
  };
}
function getInnerBoundingClientRect(element2, strategy) {
  const clientRect = getBoundingClientRect(element2, true, strategy === "fixed");
  const top = clientRect.top + element2.clientTop;
  const left = clientRect.left + element2.clientLeft;
  const scale = isHTMLElement(element2) ? getScale(element2) : createCoords(1);
  const width = element2.clientWidth * scale.x;
  const height = element2.clientHeight * scale.y;
  const x2 = left * scale.x;
  const y = top * scale.y;
  return {
    width,
    height,
    x: x2,
    y
  };
}
function getClientRectFromClippingAncestor(element2, clippingAncestor, strategy) {
  let rect;
  if (clippingAncestor === "viewport") {
    rect = getViewportRect(element2, strategy);
  } else if (clippingAncestor === "document") {
    rect = getDocumentRect(getDocumentElement(element2));
  } else if (isElement(clippingAncestor)) {
    rect = getInnerBoundingClientRect(clippingAncestor, strategy);
  } else {
    const visualOffsets = getVisualOffsets(element2);
    rect = {
      ...clippingAncestor,
      x: clippingAncestor.x - visualOffsets.x,
      y: clippingAncestor.y - visualOffsets.y
    };
  }
  return rectToClientRect(rect);
}
function hasFixedPositionAncestor(element2, stopNode) {
  const parentNode = getParentNode(element2);
  if (parentNode === stopNode || !isElement(parentNode) || isLastTraversableNode(parentNode)) {
    return false;
  }
  return getComputedStyle2(parentNode).position === "fixed" || hasFixedPositionAncestor(parentNode, stopNode);
}
function getClippingElementAncestors(element2, cache) {
  const cachedResult = cache.get(element2);
  if (cachedResult) {
    return cachedResult;
  }
  let result = getOverflowAncestors(element2, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
  let currentContainingBlockComputedStyle = null;
  const elementIsFixed = getComputedStyle2(element2).position === "fixed";
  let currentNode = elementIsFixed ? getParentNode(element2) : element2;
  while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
    const computedStyle = getComputedStyle2(currentNode);
    const currentNodeIsContaining = isContainingBlock(currentNode);
    if (!currentNodeIsContaining && computedStyle.position === "fixed") {
      currentContainingBlockComputedStyle = null;
    }
    const shouldDropCurrentNode = elementIsFixed ? !currentNodeIsContaining && !currentContainingBlockComputedStyle : !currentNodeIsContaining && computedStyle.position === "static" && !!currentContainingBlockComputedStyle && ["absolute", "fixed"].includes(currentContainingBlockComputedStyle.position) || isOverflowElement(currentNode) && !currentNodeIsContaining && hasFixedPositionAncestor(element2, currentNode);
    if (shouldDropCurrentNode) {
      result = result.filter((ancestor) => ancestor !== currentNode);
    } else {
      currentContainingBlockComputedStyle = computedStyle;
    }
    currentNode = getParentNode(currentNode);
  }
  cache.set(element2, result);
  return result;
}
function getClippingRect(_ref) {
  let {
    element: element2,
    boundary,
    rootBoundary,
    strategy
  } = _ref;
  const elementClippingAncestors = boundary === "clippingAncestors" ? getClippingElementAncestors(element2, this._c) : [].concat(boundary);
  const clippingAncestors = [...elementClippingAncestors, rootBoundary];
  const firstClippingAncestor = clippingAncestors[0];
  const clippingRect = clippingAncestors.reduce((accRect, clippingAncestor) => {
    const rect = getClientRectFromClippingAncestor(element2, clippingAncestor, strategy);
    accRect.top = max(rect.top, accRect.top);
    accRect.right = min(rect.right, accRect.right);
    accRect.bottom = min(rect.bottom, accRect.bottom);
    accRect.left = max(rect.left, accRect.left);
    return accRect;
  }, getClientRectFromClippingAncestor(element2, firstClippingAncestor, strategy));
  return {
    width: clippingRect.right - clippingRect.left,
    height: clippingRect.bottom - clippingRect.top,
    x: clippingRect.left,
    y: clippingRect.top
  };
}
function getDimensions(element2) {
  return getCssDimensions(element2);
}
function getRectRelativeToOffsetParent(element2, offsetParent, strategy) {
  const isOffsetParentAnElement = isHTMLElement(offsetParent);
  const documentElement = getDocumentElement(offsetParent);
  const isFixed = strategy === "fixed";
  const rect = getBoundingClientRect(element2, true, isFixed, offsetParent);
  let scroll = {
    scrollLeft: 0,
    scrollTop: 0
  };
  const offsets = createCoords(0);
  if (isOffsetParentAnElement || !isOffsetParentAnElement && !isFixed) {
    if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) {
      scroll = getNodeScroll(offsetParent);
    }
    if (isOffsetParentAnElement) {
      const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
      offsets.x = offsetRect.x + offsetParent.clientLeft;
      offsets.y = offsetRect.y + offsetParent.clientTop;
    } else if (documentElement) {
      offsets.x = getWindowScrollBarX(documentElement);
    }
  }
  return {
    x: rect.left + scroll.scrollLeft - offsets.x,
    y: rect.top + scroll.scrollTop - offsets.y,
    width: rect.width,
    height: rect.height
  };
}
function getTrueOffsetParent(element2, polyfill) {
  if (!isHTMLElement(element2) || getComputedStyle2(element2).position === "fixed") {
    return null;
  }
  if (polyfill) {
    return polyfill(element2);
  }
  return element2.offsetParent;
}
function getOffsetParent(element2, polyfill) {
  const window2 = getWindow(element2);
  if (!isHTMLElement(element2)) {
    return window2;
  }
  let offsetParent = getTrueOffsetParent(element2, polyfill);
  while (offsetParent && isTableElement(offsetParent) && getComputedStyle2(offsetParent).position === "static") {
    offsetParent = getTrueOffsetParent(offsetParent, polyfill);
  }
  if (offsetParent && (getNodeName(offsetParent) === "html" || getNodeName(offsetParent) === "body" && getComputedStyle2(offsetParent).position === "static" && !isContainingBlock(offsetParent))) {
    return window2;
  }
  return offsetParent || getContainingBlock(element2) || window2;
}
var getElementRects = async function(_ref) {
  let {
    reference,
    floating,
    strategy
  } = _ref;
  const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
  const getDimensionsFn = this.getDimensions;
  return {
    reference: getRectRelativeToOffsetParent(reference, await getOffsetParentFn(floating), strategy),
    floating: {
      x: 0,
      y: 0,
      ...await getDimensionsFn(floating)
    }
  };
};
function isRTL(element2) {
  return getComputedStyle2(element2).direction === "rtl";
}
var platform = {
  convertOffsetParentRelativeRectToViewportRelativeRect,
  getDocumentElement,
  getClippingRect,
  getOffsetParent,
  getElementRects,
  getClientRects,
  getDimensions,
  getScale,
  isElement,
  isRTL
};
function observeMove(element2, onMove) {
  let io = null;
  let timeoutId;
  const root = getDocumentElement(element2);
  function cleanup() {
    clearTimeout(timeoutId);
    io && io.disconnect();
    io = null;
  }
  function refresh(skip, threshold) {
    if (skip === void 0) {
      skip = false;
    }
    if (threshold === void 0) {
      threshold = 1;
    }
    cleanup();
    const {
      left,
      top,
      width,
      height
    } = element2.getBoundingClientRect();
    if (!skip) {
      onMove();
    }
    if (!width || !height) {
      return;
    }
    const insetTop = floor(top);
    const insetRight = floor(root.clientWidth - (left + width));
    const insetBottom = floor(root.clientHeight - (top + height));
    const insetLeft = floor(left);
    const rootMargin = -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px";
    const options = {
      rootMargin,
      threshold: max(0, min(1, threshold)) || 1
    };
    let isFirstUpdate = true;
    function handleObserve(entries) {
      const ratio = entries[0].intersectionRatio;
      if (ratio !== threshold) {
        if (!isFirstUpdate) {
          return refresh();
        }
        if (!ratio) {
          timeoutId = setTimeout(() => {
            refresh(false, 1e-7);
          }, 100);
        } else {
          refresh(false, ratio);
        }
      }
      isFirstUpdate = false;
    }
    try {
      io = new IntersectionObserver(handleObserve, {
        ...options,
        // Handle <iframe>s
        root: root.ownerDocument
      });
    } catch (e) {
      io = new IntersectionObserver(handleObserve, options);
    }
    io.observe(element2);
  }
  refresh(true);
  return cleanup;
}
function autoUpdate(reference, floating, update2, options) {
  if (options === void 0) {
    options = {};
  }
  const {
    ancestorScroll = true,
    ancestorResize = true,
    elementResize = typeof ResizeObserver === "function",
    layoutShift = typeof IntersectionObserver === "function",
    animationFrame = false
  } = options;
  const referenceEl = unwrapElement(reference);
  const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...getOverflowAncestors(floating)] : [];
  ancestors.forEach((ancestor) => {
    ancestorScroll && ancestor.addEventListener("scroll", update2, {
      passive: true
    });
    ancestorResize && ancestor.addEventListener("resize", update2);
  });
  const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update2) : null;
  let reobserveFrame = -1;
  let resizeObserver = null;
  if (elementResize) {
    resizeObserver = new ResizeObserver((_ref) => {
      let [firstEntry] = _ref;
      if (firstEntry && firstEntry.target === referenceEl && resizeObserver) {
        resizeObserver.unobserve(floating);
        cancelAnimationFrame(reobserveFrame);
        reobserveFrame = requestAnimationFrame(() => {
          resizeObserver && resizeObserver.observe(floating);
        });
      }
      update2();
    });
    if (referenceEl && !animationFrame) {
      resizeObserver.observe(referenceEl);
    }
    resizeObserver.observe(floating);
  }
  let frameId;
  let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
  if (animationFrame) {
    frameLoop();
  }
  function frameLoop() {
    const nextRefRect = getBoundingClientRect(reference);
    if (prevRefRect && (nextRefRect.x !== prevRefRect.x || nextRefRect.y !== prevRefRect.y || nextRefRect.width !== prevRefRect.width || nextRefRect.height !== prevRefRect.height)) {
      update2();
    }
    prevRefRect = nextRefRect;
    frameId = requestAnimationFrame(frameLoop);
  }
  update2();
  return () => {
    ancestors.forEach((ancestor) => {
      ancestorScroll && ancestor.removeEventListener("scroll", update2);
      ancestorResize && ancestor.removeEventListener("resize", update2);
    });
    cleanupIo && cleanupIo();
    resizeObserver && resizeObserver.disconnect();
    resizeObserver = null;
    if (animationFrame) {
      cancelAnimationFrame(frameId);
    }
  };
}
var computePosition2 = (reference, floating, options) => {
  const cache = /* @__PURE__ */ new Map();
  const mergedOptions = {
    platform,
    ...options
  };
  const platformWithCache = {
    ...mergedOptions.platform,
    _c: cache
  };
  return computePosition(reference, floating, {
    ...mergedOptions,
    platform: platformWithCache
  });
};

// node_modules/inclusive-elements/dist/inclusive-elements7.js
var u = Object.defineProperty;
var d2 = (i, n2, t) => n2 in i ? u(i, n2, { enumerable: true, configurable: true, writable: true, value: t }) : i[n2] = t;
var o = (i, n2, t) => (d2(i, typeof n2 != "symbol" ? n2 + "" : n2, t), t);
var C = class extends HTMLElement {
  constructor() {
    super();
    o(this, "cleanup");
    o(this, "onButtonClick", (t2) => {
      !n(t2) && !this.disabled && (this.open = !this.open, t2.preventDefault());
    });
    o(this, "onButtonKeyDown", (t2) => {
      var e;
      t2.key === "ArrowDown" && !this.disabled && (t2.preventDefault(), this.open = true, (e = focusable(this.content)[0]) == null || e.focus());
    });
    o(this, "onKeyDown", (t2) => {
      t2.key === "Escape" && this.open && (t2.preventDefault(), t2.stopPropagation(), this.open = false, this.button.focus());
    });
    o(this, "onFocusOut", (t2) => {
      (!(t2.relatedTarget instanceof Node) || !this.contains(t2.relatedTarget)) && (this.open = false);
    });
    o(this, "onContentClick", (t2) => {
      t2.target instanceof Element && t2.target.closest("[role=menuitem], [role=menuitemradio]") && (this.open = false, this.button.focus());
    });
    const t = document.createElement("template");
    t.innerHTML = `
            <div part="backdrop" hidden style="position: fixed; top: 0; left: 0; right: 0; bottom: 0"></div>
            <slot></slot>
        `, this.attachShadow({ mode: "open" }).appendChild(t.content.cloneNode(true)), this.backdrop.onclick = () => this.open = false;
  }
  static get observedAttributes() {
    return ["open"];
  }
  connectedCallback() {
    this.backdrop.hidden = true, this.content.hidden = true, this.open = false, this.button.setAttribute("aria-expanded", "false"), setTimeout(() => {
      this.content.getAttribute("role") === "menu" && this.button.setAttribute("aria-haspopup", "true");
    }), this.button.addEventListener("click", this.onButtonClick), this.button.addEventListener("keydown", this.onButtonKeyDown), this.addEventListener("keydown", this.onKeyDown), this.addEventListener("focusout", this.onFocusOut), this.content.addEventListener("click", this.onContentClick);
  }
  disconnectedCallback() {
    g(this.backdrop), g(this.content), this.button.removeAttribute("aria-expanded"), this.button.removeAttribute("aria-haspopup"), this.button.removeEventListener("click", this.onButtonClick), this.button.removeEventListener("keydown", this.onButtonKeyDown), this.removeEventListener("keydown", this.onKeyDown), this.removeEventListener("focusout", this.onFocusOut), this.content.removeEventListener("click", this.onContentClick);
  }
  get open() {
    return this.hasAttribute("open");
  }
  set open(t) {
    t ? this.setAttribute("open", "") : this.removeAttribute("open");
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  attributeChangedCallback(t, e, s) {
    t === "open" && (s !== null ? this.wasOpened() : this.wasClosed());
  }
  wasOpened() {
    if (!this.content.hidden)
      return;
    this.content.hidden = false, this.content.style.position = "absolute", this.backdrop.hidden = false, L(this.content), L(this.backdrop), this.button.setAttribute("aria-expanded", "true"), this.cleanup = autoUpdate(
      this.button,
      this.content,
      () => {
        computePosition2(this.button, this.content, {
          placement: this.getAttribute("placement") || "bottom",
          middleware: [
            shift(),
            flip(),
            size({
              apply: ({ availableWidth: e, availableHeight: s }) => {
                Object.assign(this.content.style, {
                  maxWidth: "",
                  maxHeight: ""
                });
                const h = getComputedStyle(this.content);
                (h.maxWidth === "none" || e < parseInt(h.maxWidth)) && (this.content.style.maxWidth = `${e}px`), (h.maxHeight === "none" || s < parseInt(h.maxHeight)) && (this.content.style.maxHeight = `${s}px`);
              }
            })
          ]
        }).then(({ x: e, y: s, placement: h }) => {
          Object.assign(this.content.style, {
            left: `${e}px`,
            top: `${s}px`
          }), this.content.dataset.placement = h;
        });
      },
      { ancestorScroll: false }
    );
    const t = this.content.querySelector("[autofocus]");
    t ? t.focus() : this.content.focus(), this.dispatchEvent(new Event("open"));
  }
  wasClosed() {
    var t;
    this.content.hidden || (this.button.setAttribute("aria-expanded", "false"), (t = this.cleanup) == null || t.call(this), x(this.backdrop).then(() => this.backdrop.hidden = true), x(this.content).then(() => this.content.hidden = true), this.dispatchEvent(new Event("close")));
  }
  get backdrop() {
    var t;
    return (t = this.shadowRoot) == null ? void 0 : t.firstElementChild;
  }
  get button() {
    return this.querySelector("button, [role=button]");
  }
  get content() {
    return this.children[1];
  }
};

// node_modules/emoji-picker-element/i18n/ar.js
var ar_default = {
  categoriesLabel: "\u0627\u0644\u0641\u0626\u0627\u062A",
  emojiUnsupportedMessage: "\u0645\u062A\u0635\u0641\u062D\u0643 \u0644\u0627 \u064A\u062F\u0639\u0645 \u0631\u0645\u0648\u0632 \u0627\u0644\u0645\u0634\u0627\u0639\u0631 \u0627\u0644\u0645\u0644\u0648\u0646\u0629.",
  favoritesLabel: "\u0627\u0644\u0645\u0641\u0636\u0644\u0629",
  loadingMessage: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",
  networkErrorMessage: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0631\u0645\u0632 \u0645\u0634\u0627\u0639\u0631.",
  regionLabel: "\u0645\u0646\u062A\u0642\u064A \u0631\u0645\u0648\u0632 \u0627\u0644\u0645\u0634\u0627\u0639\u0631",
  searchDescription: "\u0639\u0646\u062F\u0645\u0627 \u062A\u0643\u0648\u0646 \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0628\u062D\u062B \u0645\u062A\u0627\u062D\u0629\u060C \u0627\u0636\u063A\u0637 \u0627\u0644\u0633\u0647\u0645 \u0644\u0623\u0639\u0644\u0649 \u0623\u0648 \u0644\u0623\u0633\u0641\u0644 \u0644\u0644\u062A\u062D\u062F\u064A\u062F \u0648\u0627\u0636\u063A\u0637 enter \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631.",
  searchLabel: "\u0628\u062D\u062B",
  searchResultsLabel: "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0628\u062D\u062B",
  skinToneDescription: "\u0639\u0646\u062F \u062A\u0648\u0633\u064A\u0639 \u0627\u0644\u0646\u062A\u0627\u0626\u062C\u060C \u0627\u0636\u063A\u0637 \u0627\u0644\u0633\u0647\u0645 \u0644\u0623\u0639\u0644\u0649 \u0623\u0648 \u0644\u0623\u0633\u0641\u0644 \u0644\u0644\u062A\u062D\u062F\u064A\u062F \u0648\u0627\u0636\u063A\u0637 enter \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631.",
  skinToneLabel: "\u0627\u062E\u062A\u0631 \u062F\u0631\u062C\u0629 \u0644\u0648\u0646 \u0627\u0644\u0628\u0634\u0631\u0629 (\u062D\u0627\u0644\u064A\u064B\u0627 {skinTone})",
  skinTonesLabel: "\u062F\u0631\u062C\u0627\u062A \u0644\u0648\u0646 \u0627\u0644\u0628\u0634\u0631\u0629",
  skinTones: [
    "\u0627\u0641\u062A\u0631\u0627\u0636\u064A",
    "\u0641\u0627\u062A\u062D",
    "\u0641\u0627\u062A\u062D \u0645\u062A\u0648\u0633\u0637",
    "\u0645\u062A\u0648\u0633\u0637",
    "\u062F\u0627\u0643\u0646 \u0645\u062A\u0648\u0633\u0637",
    "\u062F\u0627\u0643\u0646"
  ],
  categories: {
    custom: "\u0645\u062E\u0635\u0635",
    "smileys-emotion": "\u0627\u0644\u0648\u062C\u0648\u0647 \u0627\u0644\u0636\u0627\u062D\u0643\u0629 \u0648\u0631\u0645\u0648\u0632 \u0627\u0644\u0645\u0634\u0627\u0639\u0631",
    "people-body": "\u0627\u0644\u0623\u0634\u062E\u0627\u0635 \u0648\u0627\u0644\u062C\u0633\u062F",
    "animals-nature": "\u0627\u0644\u062D\u064A\u0648\u0627\u0646\u0627\u062A \u0648\u0627\u0644\u0637\u0628\u064A\u0639\u0629",
    "food-drink": "\u0627\u0644\u0637\u0639\u0627\u0645 \u0648\u0627\u0644\u0634\u0631\u0627\u0628",
    "travel-places": "\u0627\u0644\u0633\u0641\u0631 \u0648\u0627\u0644\u0623\u0645\u0627\u0643\u0646",
    activities: "\u0627\u0644\u0623\u0646\u0634\u0637\u0629",
    objects: "\u0627\u0644\u0623\u0634\u064A\u0627\u0621",
    symbols: "\u0627\u0644\u0631\u0645\u0648\u0632",
    flags: "\u0627\u0644\u0623\u0639\u0644\u0627\u0645"
  }
};

// node_modules/emoji-picker-element/i18n/de.js
var de_default = {
  categoriesLabel: "Kategorien",
  emojiUnsupportedMessage: "Dein Browser unterst\xFCtzt keine farbigen Emojis.",
  favoritesLabel: "Favoriten",
  loadingMessage: "Wird geladen\u2026",
  networkErrorMessage: "Konnte Emoji nicht laden.",
  regionLabel: "Emoji ausw\xE4hlen",
  searchDescription: "Wenn Suchergebnisse verf\xFCgbar sind, w\xE4hle sie mit Pfeil rauf und runter, dann Eingabetaste, aus.",
  searchLabel: "Suchen",
  searchResultsLabel: "Suchergebnisse",
  skinToneDescription: "Wenn angezeigt, nutze Pfeiltasten rauf und runter zum Ausw\xE4hlen, Eingabe zum Akzeptieren.",
  skinToneLabel: "W\xE4hle einen Hautton (aktuell {skinTone})",
  skinTonesLabel: "Hautt\xF6ne",
  skinTones: [
    "Standard",
    "Hell",
    "Mittel-hell",
    "Mittel",
    "Mittel-dunkel",
    "Dunkel"
  ],
  categories: {
    custom: "Benutzerdefiniert",
    "smileys-emotion": "Smileys und Emoticons",
    "people-body": "Menschen und K\xF6rper",
    "animals-nature": "Tiere und Natur",
    "food-drink": "Essen und Trinken",
    "travel-places": "Reisen und Orte",
    activities: "Aktivit\xE4ten",
    objects: "Objekte",
    symbols: "Symbole",
    flags: "Flaggen"
  }
};

// node_modules/emoji-picker-element/i18n/en.js
var en_default = {
  categoriesLabel: "Categories",
  emojiUnsupportedMessage: "Your browser does not support color emoji.",
  favoritesLabel: "Favorites",
  loadingMessage: "Loading\u2026",
  networkErrorMessage: "Could not load emoji.",
  regionLabel: "Emoji picker",
  searchDescription: "When search results are available, press up or down to select and enter to choose.",
  searchLabel: "Search",
  searchResultsLabel: "Search results",
  skinToneDescription: "When expanded, press up or down to select and enter to choose.",
  skinToneLabel: "Choose a skin tone (currently {skinTone})",
  skinTonesLabel: "Skin tones",
  skinTones: [
    "Default",
    "Light",
    "Medium-Light",
    "Medium",
    "Medium-Dark",
    "Dark"
  ],
  categories: {
    custom: "Custom",
    "smileys-emotion": "Smileys and emoticons",
    "people-body": "People and body",
    "animals-nature": "Animals and nature",
    "food-drink": "Food and drink",
    "travel-places": "Travel and places",
    activities: "Activities",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags"
  }
};

// node_modules/emoji-picker-element/i18n/es.js
var es_default = {
  categoriesLabel: "Categor\xEDas",
  emojiUnsupportedMessage: "El navegador no admite emojis de color.",
  favoritesLabel: "Favoritos",
  loadingMessage: "Cargando\u2026",
  networkErrorMessage: "No se pudo cargar el emoji.",
  regionLabel: "Selector de emojis",
  searchDescription: "Cuando est\xE9n disponibles los resultados, pulsa la tecla hacia arriba o hacia abajo para seleccionar y la tecla intro para elegir.",
  searchLabel: "Buscar",
  searchResultsLabel: "Resultados de b\xFAsqueda",
  skinToneDescription: "Cuando se abran las opciones, pulsa la tecla hacia arriba o hacia abajo para seleccionar y la tecla intro para elegir.",
  skinToneLabel: "Elige un tono de piel ({skinTone} es el actual)",
  skinTonesLabel: "Tonos de piel",
  skinTones: [
    "Predeterminado",
    "Claro",
    "Claro medio",
    "Medio",
    "Oscuro medio",
    "Oscuro"
  ],
  categories: {
    custom: "Personalizado",
    "smileys-emotion": "Emojis y emoticones",
    "people-body": "Personas y partes del cuerpo",
    "animals-nature": "Animales y naturaleza",
    "food-drink": "Comida y bebida",
    "travel-places": "Viajes y lugares",
    activities: "Actividades",
    objects: "Objetos",
    symbols: "S\xEDmbolos",
    flags: "Banderas"
  }
};

// node_modules/emoji-picker-element/i18n/fr.js
var fr_default = {
  categoriesLabel: "Cat\xE9gories",
  emojiUnsupportedMessage: "Votre navigateur ne soutient pas les emojis en couleur.",
  favoritesLabel: "Favoris",
  loadingMessage: "Chargement en cours\u2026",
  networkErrorMessage: "Impossible de charger les emojis.",
  regionLabel: "Choisir un emoji",
  searchDescription: "Quand les r\xE9sultats sont disponisbles, appuyez la fleche vers le haut ou le bas et la touche entr\xE9e pour choisir.",
  searchLabel: "Rechercher",
  searchResultsLabel: "R\xE9sultats",
  skinToneDescription: "Quand disponible, appuyez la fleche vers le haut ou le bas et la touch entr\xE9e pour choisir.",
  skinToneLabel: "Choisir une couleur de peau (actuellement {skinTone})",
  skinTonesLabel: "Couleurs de peau",
  skinTones: [
    "D\xE9faut",
    "Clair",
    "Moyennement clair",
    "Moyen",
    "Moyennement sombre",
    "Sombre"
  ],
  categories: {
    custom: "Customis\xE9",
    "smileys-emotion": "Les smileyes et les \xE9motic\xF4nes",
    "people-body": "Les gens et le corps",
    "animals-nature": "Les animaux et la nature",
    "food-drink": "La nourriture et les boissons",
    "travel-places": "Les voyages et les endroits",
    activities: "Les activit\xE9s",
    objects: "Les objets",
    symbols: "Les symbols",
    flags: "Les drapeaux"
  }
};

// node_modules/emoji-picker-element/i18n/hi.js
var hi_default = {
  categoriesLabel: "\u0936\u094D\u0930\u0947\u0923\u093F\u092F\u093E\u0901",
  emojiUnsupportedMessage: "\u0906\u092A\u0915\u093E \u092C\u094D\u0930\u093E\u0909\u091C\u093C\u0930 \u0915\u0932\u0930 \u0907\u092E\u094B\u091C\u0940 \u0915\u093E \u0938\u092E\u0930\u094D\u0925\u0928 \u0928\u0939\u0940\u0902 \u0915\u0930\u0924\u093E\u0964",
  favoritesLabel: "\u092A\u0938\u0902\u0926\u0940\u0926\u093E",
  loadingMessage: "\u0932\u094B\u0921 \u0939\u094B \u0930\u0939\u093E \u0939\u0948...",
  networkErrorMessage: "\u0907\u092E\u094B\u091C\u0940 \u0932\u094B\u0921 \u0928\u0939\u0940\u0902 \u0939\u094B \u0938\u0915\u0947\u0964",
  regionLabel: "\u0907\u092E\u094B\u091C\u0940 \u091A\u0941\u0928\u0928\u0947\u0935\u093E\u0932\u093E",
  searchDescription: "\u091C\u092C \u0916\u094B\u091C \u092A\u0930\u093F\u0923\u093E\u092E \u0909\u092A\u0932\u092C\u094D\u0927 \u0939\u094B\u0902 \u0924\u094B \u091A\u092F\u0928 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u090A\u092A\u0930 \u092F\u093E \u0928\u0940\u091A\u0947 \u0926\u092C\u093E\u090F\u0902 \u0914\u0930 \u091A\u0941\u0928\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u090F\u0902\u091F\u0930 \u0926\u092C\u093E\u090F\u0902\u0964",
  searchLabel: "\u0916\u094B\u091C",
  searchResultsLabel: "\u0916\u094B\u091C \u0915\u0947 \u092A\u0930\u093F\u0923\u093E\u092E",
  skinToneDescription: "\u091C\u092C \u0935\u093F\u0938\u094D\u0924\u0943\u0924 \u0915\u093F\u092F\u093E \u091C\u093E\u0924\u093E \u0939\u0948 \u0924\u094B \u091A\u092F\u0928 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u090A\u092A\u0930 \u092F\u093E \u0928\u0940\u091A\u0947 \u0926\u092C\u093E\u090F\u0902 \u0914\u0930 \u091A\u0941\u0928\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u090F\u0902\u091F\u0930 \u0926\u092C\u093E\u090F\u0902\u0964",
  skinToneLabel: "\u0924\u094D\u0935\u091A\u093E \u0915\u093E \u0930\u0902\u0917 \u091A\u0941\u0928\u0947\u0902 (\u0935\u0930\u094D\u0924\u092E\u093E\u0928 \u092E\u0947\u0902 {skinTone})",
  skinTonesLabel: "\u0924\u094D\u0935\u091A\u093E \u0915\u0947 \u0930\u0902\u0917",
  skinTones: [
    "\u0921\u093F\u092B\u0949\u0932\u094D\u091F",
    "\u0939\u0932\u094D\u0915\u093E",
    "\u092E\u0927\u094D\u092F\u092E \u0939\u0932\u094D\u0915\u093E",
    "\u092E\u0927\u094D\u092F\u092E",
    "\u092E\u0927\u094D\u092F\u092E \u0917\u0939\u0930\u093E",
    "\u0917\u0939\u0930\u093E"
  ],
  categories: {
    custom: "\u0915\u0938\u094D\u091F\u092E",
    "smileys-emotion": "\u0938\u094D\u092E\u093E\u0907\u0932\u0940 \u0914\u0930 \u0907\u092E\u094B\u091F\u093F\u0915\u0949\u0928\u094D\u0938",
    "people-body": "\u0932\u094B\u0917 \u0914\u0930 \u0936\u0930\u0940\u0930",
    "animals-nature": "\u092A\u0936\u0941 \u0914\u0930 \u092A\u094D\u0930\u0915\u0943\u0924\u093F",
    "food-drink": "\u0916\u093E\u0926\u094D\u092F \u0914\u0930 \u092A\u0947\u092F",
    "travel-places": "\u092F\u093E\u0924\u094D\u0930\u093E \u0914\u0930 \u0938\u094D\u0925\u093E\u0928",
    activities: "\u0917\u0924\u093F\u0935\u093F\u0927\u093F\u092F\u093E\u0902",
    objects: "\u0935\u0938\u094D\u0924\u0941\u090F\u0902",
    symbols: "\u092A\u094D\u0930\u0924\u0940\u0915",
    flags: "\u091D\u0902\u0921\u0947"
  }
};

// node_modules/emoji-picker-element/i18n/id.js
var id_default = {
  categoriesLabel: "Kategori",
  emojiUnsupportedMessage: "Browser Anda tidak mendukung emoji warna.",
  favoritesLabel: "Favorit",
  loadingMessage: "Memuat...",
  networkErrorMessage: "Tidak dapat memuat emoji.",
  regionLabel: "Pemilih emoji",
  searchDescription: "Ketika hasil pencarian tersedia, tekan atas atau bawah untuk menyeleksi dan enter untuk memilih.",
  searchLabel: "Cari",
  searchResultsLabel: "Hasil Pencarian",
  skinToneDescription: "Saat diperluas tekan atas atau bawah untuk menyeleksi dan enter untuk memilih.",
  skinToneLabel: "Pilih warna skin (saat ini {skinTone})",
  skinTonesLabel: "Warna skin",
  skinTones: [
    "Default",
    "Light",
    "Medium light",
    "Medium",
    "Medium dark",
    "Dark"
  ],
  categories: {
    custom: "Kustom",
    "smileys-emotion": "Smiley dan emoticon",
    "people-body": "Orang dan bagian tubuh",
    "animals-nature": "Hewan dan tumbuhan",
    "food-drink": "Makanan dan minuman",
    "travel-places": "Rekreasi dan tempat",
    activities: "Aktivitas",
    objects: "Objek",
    symbols: "Simbol",
    flags: "Bendera"
  }
};

// node_modules/emoji-picker-element/i18n/it.js
var it_default = {
  categoriesLabel: "Categorie",
  emojiUnsupportedMessage: "Il tuo browser non supporta le emoji colorate.",
  favoritesLabel: "Preferiti",
  loadingMessage: "Caricamento...",
  networkErrorMessage: "Impossibile caricare le emoji.",
  regionLabel: "Selezione emoji",
  searchDescription: "Quando i risultati della ricerca sono disponibili, premi su o gi\xF9 per selezionare e invio per scegliere.",
  searchLabel: "Cerca",
  searchResultsLabel: "Risultati di ricerca",
  skinToneDescription: "Quando espanso, premi su o gi\xF9 per selezionare e invio per scegliere.",
  skinToneLabel: "Scegli una tonalit\xE0 della pelle (corrente {skinTone})",
  skinTonesLabel: "Tonalit\xE0 della pelle",
  skinTones: [
    "Predefinita",
    "Chiara",
    "Medio-Chiara",
    "Media",
    "Medio-Scura",
    "Scura"
  ],
  categories: {
    custom: "Personalizzata",
    "smileys-emotion": "Faccine ed emozioni",
    "people-body": "Persone e corpi",
    "animals-nature": "Animali e natura",
    "food-drink": "Cibi e bevande",
    "travel-places": "Viaggi e luoghi",
    activities: "Attivit\xE0",
    objects: "Oggetti",
    symbols: "Simboli",
    flags: "Bandiere"
  }
};

// node_modules/emoji-picker-element/i18n/ms_MY.js
var ms_MY_default = {
  categoriesLabel: "Kategori",
  emojiUnsupportedMessage: "Penyemak imbas anda tidak menyokong emoji warna.",
  favoritesLabel: "Kegemaran",
  loadingMessage: "Memuat\u2026",
  networkErrorMessage: "Tidak dapat memuatkan emoji.",
  regionLabel: "Pemilih emoji",
  searchDescription: "Apabila hasil carian tersedia, tekan atas atau bawah untuk memilih dan tekan masukkan untuk memilih.",
  searchLabel: "Cari",
  searchResultsLabel: "Hasil carian",
  skinToneDescription: "Apabila dikembangkan, tekan atas atau bawah untuk memilih dan tekan masukkan untuk memilih.",
  skinToneLabel: "Pilih warna kulit (pada masa ini {skinTone})",
  skinTonesLabel: "Warna kulit",
  skinTones: [
    "Lalai",
    "Cerah",
    "Kuning langsat",
    "Sederhana cerah",
    "Sawo matang",
    "Gelap"
  ],
  categories: {
    custom: "Tersuai",
    "smileys-emotion": "Smiley dan emotikon",
    "people-body": "Orang dan badan",
    "animals-nature": "Haiwan dan alam semula jadi",
    "food-drink": "Makanan dan minuman",
    "travel-places": "Perjalanan dan tempat",
    activities: "Aktiviti",
    objects: "Objek",
    symbols: "Simbol",
    flags: "Bendera"
  }
};

// node_modules/emoji-picker-element/i18n/nl.js
var nl_default = {
  categoriesLabel: "Categorie\xEBn",
  emojiUnsupportedMessage: "Uw browser ondersteunt geen kleurenemoji.",
  favoritesLabel: "Favorieten",
  loadingMessage: "Bezig met laden\u2026",
  networkErrorMessage: "Kan emoji niet laden.",
  regionLabel: "Emoji-kiezer",
  searchDescription: "Als er zoekresultaten beschikbaar zijn, drukt u op omhoog of omlaag om te selecteren en op enter om te kiezen.",
  searchLabel: "Zoeken",
  searchResultsLabel: "Zoekresultaten",
  skinToneDescription: "Wanneer uitgevouwen, druk omhoog of omlaag om te selecteren en enter om te kiezen.",
  skinToneLabel: "Kies een huidskleur (momenteel {skinTone})",
  skinTonesLabel: "Huidskleuren",
  skinTones: [
    "Standaard",
    "Licht",
    "Medium-Licht",
    "Medium",
    "Middeldonker",
    "Donker"
  ],
  categories: {
    custom: "Aangepast",
    "smileys-emotion": "Smileys en emoticons",
    "people-body": "Mensen en lichaam",
    "animals-nature": "Dieren en natuur",
    "food-drink": "Eten en drinken",
    "travel-places": "Reizen en plaatsen",
    activities: "Activiteiten",
    objects: "Voorwerpen",
    symbols: "Symbolen",
    flags: "Vlaggen"
  }
};

// node_modules/emoji-picker-element/i18n/pt_BR.js
var pt_BR_default = {
  categoriesLabel: "Categorias",
  emojiUnsupportedMessage: "Seu navegador n\xE3o suporta emojis coloridos.",
  favoritesLabel: "Favoritos",
  loadingMessage: "Carregando\u2026",
  networkErrorMessage: "N\xE3o foi poss\xEDvel carregar o emoji.",
  regionLabel: "Seletor de emoji",
  searchDescription: "Quando os resultados da pesquisa estiverem dispon\xEDveis, pressione para cima ou para baixo para selecionar e \u201Center\u201D para escolher.",
  searchLabel: "Procurar",
  searchResultsLabel: "Resultados da pesquisa",
  skinToneDescription: "Quando expandido, pressione para cima ou para baixo para selecionar e \u201Center\u201D para escolher.",
  skinToneLabel: "Escolha um tom de pele (atualmente {skinTone})",
  skinTonesLabel: "Tons de pele",
  skinTones: [
    "Padr\xE3o",
    "Claro",
    "Claro m\xE9dio",
    "M\xE9dio",
    "Escuro m\xE9dio",
    "Escuro"
  ],
  categories: {
    custom: "Personalizar",
    "smileys-emotion": "Carinhas e emoticons",
    "people-body": "Pessoas e corpo",
    "animals-nature": "Animais e natureza",
    "food-drink": "Alimentos e bebidas",
    "travel-places": "Viagem e lugares",
    activities: "Atividades",
    objects: "Objetos",
    symbols: "S\xEDmbolos",
    flags: "Bandeiras"
  }
};

// node_modules/emoji-picker-element/i18n/pt_PT.js
var pt_PT_default = {
  categoriesLabel: "Categorias",
  emojiUnsupportedMessage: "O seu browser n\xE3o suporta emojis.",
  favoritesLabel: "Favoritos",
  loadingMessage: "A Carregar\u2026",
  networkErrorMessage: "N\xE3o foi poss\xEDvel carregar o emoji.",
  regionLabel: "Emoji picker",
  searchDescription: "Quando os resultados da pesquisa estiverem dispon\xEDveis, pressione para cima ou para baixo para selecionar e digite para escolher.",
  searchLabel: "Procurar",
  searchResultsLabel: "Resultados da procura",
  skinToneDescription: "Quando expandido, pressione para cima ou para baixo para selecionar e digite para escolher.",
  skinToneLabel: "Escolha um tom de pele (atual {skinTone})",
  skinTonesLabel: "Tons de pele",
  skinTones: [
    "Pr\xE9-definido",
    "Claro",
    "M\xE9dio-Claro",
    "M\xE9dio",
    "M\xE9dio-Escuro",
    "Escuro"
  ],
  categories: {
    custom: "Personalizados",
    "smileys-emotion": "Smileys e emoticons",
    "people-body": "Pessoas e corpo",
    "animals-nature": "Animais e natureza",
    "food-drink": "Comida e bebida",
    "travel-places": "Viagens e locais",
    activities: "Atividades",
    objects: "Objetos",
    symbols: "S\xEDmbolos",
    flags: "Bandeiras"
  }
};

// node_modules/emoji-picker-element/i18n/ru_RU.js
var ru_RU_default = {
  categoriesLabel: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438",
  emojiUnsupportedMessage: "\u0412\u0430\u0448 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0446\u0432\u0435\u0442\u043D\u044B\u0435 \u044D\u043C\u043E\u0434\u0437\u0438.",
  favoritesLabel: "\u0418\u0437\u0431\u0440\u0430\u043D\u043D\u043E\u0435",
  loadingMessage: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
  networkErrorMessage: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u044D\u043C\u043E\u0434\u0437\u0438. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443.",
  regionLabel: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u044D\u043C\u043E\u0434\u0437\u0438",
  searchDescription: "\u041A\u043E\u0433\u0434\u0430 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u043E\u0438\u0441\u043A\u0430 \u0441\u0442\u0430\u043D\u0443\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B, \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0445 \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u0441\u0442\u0440\u0435\u043B\u043E\u043A \u0432\u0432\u0435\u0440\u0445 \u0438 \u0432\u043D\u0438\u0437, \u0437\u0430\u0442\u0435\u043C \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F.",
  searchLabel: "\u0418\u0441\u043A\u0430\u0442\u044C",
  searchResultsLabel: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u043E\u0438\u0441\u043A\u0430",
  skinToneDescription: "\u041F\u0440\u0438 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043A\u043B\u0430\u0432\u0438\u0448\u0438 \u0441\u043E \u0441\u0442\u0440\u0435\u043B\u043A\u0430\u043C\u0438 \u0432\u0432\u0435\u0440\u0445 \u0438 \u0432\u043D\u0438\u0437 \u0434\u043B\u044F \u0432\u044B\u0431\u043E\u0440\u0430, \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F.",
  skinToneLabel: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u0442\u0442\u0435\u043D\u043E\u043A \u043A\u043E\u0436\u0438 (\u0442\u0435\u043A\u0443\u0449\u0438\u0439 {skinTone})",
  skinTonesLabel: "\u041E\u0442\u0442\u0435\u043D\u043A\u0438 \u043A\u043E\u0436\u0438",
  skinTones: [
    "\u0421\u0442\u0430\u043D\u0434\u0430\u0440\u0442\u043D\u044B\u0439",
    "\u0421\u0432\u0435\u0442\u043B\u044B\u0439",
    "\u0421\u0440\u0435\u0434\u043D\u0435-\u0441\u0432\u0435\u0442\u043B\u044B\u0439",
    "\u0421\u0440\u0435\u0434\u043D\u0438\u0439",
    "\u0421\u0440\u0435\u0434\u043D\u0435-\u0442\u0435\u043C\u043D\u044B\u0439",
    "\u0422\u0435\u043C\u043D\u044B\u0439"
  ],
  categories: {
    custom: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439",
    "smileys-emotion": "\u0421\u043C\u0430\u0439\u043B\u0438\u043A\u0438 \u0438 \u042D\u043C\u043E\u0442\u0438\u043A\u043E\u043D\u044B",
    "people-body": "\u041B\u044E\u0434\u0438 \u0438 \u0422\u0435\u043B\u0430",
    "animals-nature": "\u0416\u0438\u0432\u043E\u0442\u043D\u044B\u0435 \u0438 \u041F\u0440\u0438\u0440\u043E\u0434\u0430",
    "food-drink": "\u0415\u0434\u0430 \u0438 \u041D\u0430\u043F\u0438\u0442\u043A\u0438",
    "travel-places": "\u041F\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0438\u044F \u0438 \u041C\u0435\u0441\u0442\u0430",
    activities: "\u0412\u0438\u0434\u044B \u0434\u0435\u044F\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u0438",
    objects: "\u041E\u0431\u044A\u0435\u043A\u0442\u044B",
    symbols: "\u0421\u0438\u043C\u0432\u043E\u043B\u044B",
    flags: "\u0424\u043B\u0430\u0433\u0438"
  }
};

// node_modules/emoji-picker-element/i18n/tr.js
var tr_default = {
  categoriesLabel: "Kategoriler",
  emojiUnsupportedMessage: "Taray\u0131c\u0131n\u0131z renkli emojiyi desteklemiyor.",
  favoritesLabel: "Favoriler",
  loadingMessage: "Y\xFCkleniyor\u2026",
  networkErrorMessage: "Emoji y\xFCklenemedi.",
  regionLabel: "Emoji se\xE7ici",
  searchDescription: "Arama sonu\xE7lar\u0131 mevcut oldu\u011Funda se\xE7mek i\xE7in yukar\u0131 veya a\u015Fa\u011F\u0131 bas\u0131n ve se\xE7mek i\xE7in girin.",
  searchLabel: "Arama",
  searchResultsLabel: "Arama sonu\xE7lar\u0131",
  skinToneDescription: "Geni\u015Fletildi\u011Finde se\xE7mek i\xE7in yukar\u0131 veya a\u015Fa\u011F\u0131 bas\u0131n ve se\xE7mek i\xE7in girin.",
  skinToneLabel: "Cilt tonu se\xE7in (\u015Fu anda {skinTone})",
  skinTonesLabel: "Cilt tonlar\u0131",
  skinTones: [
    "Varsay\u0131lan",
    "I\u015F\u0131k",
    "Orta \u0131\u015F\u0131k",
    "Orta",
    "Orta koyu",
    "Karanl\u0131k"
  ],
  categories: {
    custom: "Gelenek",
    "smileys-emotion": "Suratlar ve ifadeler",
    "people-body": "\u0130nsanlar ve v\xFCcut",
    "animals-nature": "Hayvanlar ve do\u011Fa",
    "food-drink": "Yiyecek ve i\xE7ecek",
    "travel-places": "Seyahat ve yerler",
    activities: "Aktiviteler",
    objects: "Nesneler",
    symbols: "Semboller",
    flags: "Bayraklar"
  }
};

// node_modules/emoji-picker-element/i18n/zh_CN.js
var zh_CN_default = {
  categoriesLabel: "\u7C7B\u522B",
  emojiUnsupportedMessage: "\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u5F69\u8272\u8868\u60C5\u7B26\u53F7\u3002",
  favoritesLabel: "\u6536\u85CF\u5939",
  loadingMessage: "\u6B63\u5728\u52A0\u8F7D\u2026",
  networkErrorMessage: "\u65E0\u6CD5\u52A0\u8F7D\u8868\u60C5\u7B26\u53F7\u3002",
  regionLabel: "\u8868\u60C5\u7B26\u53F7\u9009\u62E9\u5668",
  searchDescription: "\u5F53\u641C\u7D22\u7ED3\u679C\u53EF\u7528\u65F6\uFF0C\u6309\u5411\u4E0A\u6216\u5411\u4E0B\u9009\u62E9\u5E76\u8F93\u5165\u9009\u62E9\u3002",
  searchLabel: "\u641C\u7D22",
  searchResultsLabel: "\u641C\u7D22\u7ED3\u679C",
  skinToneDescription: "\u5C55\u5F00\u65F6\uFF0C\u6309\u5411\u4E0A\u6216\u5411\u4E0B\u952E\u8FDB\u884C\u9009\u62E9\uFF0C\u6309\u56DE\u8F66\u952E\u8FDB\u884C\u9009\u62E9\u3002",
  skinToneLabel: "\u9009\u62E9\u80A4\u8272\uFF08\u5F53\u524D\u4E3A {skinTone}\uFF09",
  skinTonesLabel: "\u80A4\u8272",
  skinTones: ["\u9ED8\u8BA4", "\u660E\u4EAE", "\u5FAE\u4EAE", "\u4E2D\u7B49", "\u5FAE\u6697", "\u6697"],
  categories: {
    custom: "\u81EA\u5B9A\u4E49",
    "smileys-emotion": "\u7B11\u8138\u548C\u8868\u60C5",
    "people-body": "\u4EBA\u7269\u548C\u8EAB\u4F53",
    "animals-nature": "\u52A8\u7269\u4E0E\u81EA\u7136",
    "food-drink": "\u98DF\u54C1\u996E\u6599",
    "travel-places": "\u65C5\u884C\u548C\u5730\u65B9",
    activities: "\u6D3B\u52A8",
    objects: "\u7269\u4F53",
    symbols: "\u7B26\u53F7",
    flags: "\u65D7\u5E1C"
  }
};

// resources/js/emoji-picker-element.js
window.customElements.define("ui-popup", C);
function emojiPickerElement({ state, locale }) {
  let i18n = en_default, l = "en";
  switch (locale) {
    case "ar":
      i18n = ar_default;
      l = "ar";
      break;
    case "de":
      i18n = de_default;
      l = "de";
      break;
    case "en":
      i18n = en_default;
      l = "en";
      break;
    case "es":
      i18n = es_default;
      l = "es";
      break;
    case "fr":
      i18n = fr_default;
      l = "fr";
      break;
    case "hi":
      i18n = hi_default;
      l = "hi";
      break;
    case "id":
      i18n = id_default;
      l = "id";
      break;
    case "it":
      i18n = it_default;
      l = "it";
      break;
    case "ms_MY":
      i18n = ms_MY_default;
      l = "ms_MY";
      break;
    case "nl":
      i18n = nl_default;
      l = "nl";
      break;
    case "pt_BR":
      i18n = pt_BR_default;
      l = "pt_BR";
      break;
    case "pt_PT":
      i18n = pt_PT_default;
      l = "pt_PT";
      break;
    case "ru_RU":
      i18n = ru_RU_default;
      l = "ru_RU";
      break;
    case "tr":
      i18n = tr_default;
      l = "tr";
      break;
    case "zh_CN":
      i18n = zh_CN_default;
      l = "zh_CN";
      break;
    default:
      i18n = en_default;
      l = "en";
      break;
  }
  return {
    state,
    init() {
      const emojiPicker = new PickerElement({
        emojiVersion: 15,
        locale: l,
        i18n
      });
      this.$refs.picker.appendChild(emojiPicker);
    }
  };
}
export {
  emojiPickerElement as default
};
/*! Bundled license information:

tabbable/dist/index.esm.js:
  (*!
  * tabbable 5.3.3
  * @license MIT, https://github.com/focus-trap/tabbable/blob/master/LICENSE
  *)
*/
