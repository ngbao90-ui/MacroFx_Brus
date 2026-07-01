// Merges a partial "patch" object (only the objects the LLM decided to change)
// into the full dashboard dataset. Arrays are merged by matching key
// (code / id / pair), not replaced wholesale — this is what lets the LLM
// emit e.g. just `{ "currencies": [{ "code": "CAD", "score": 3.6, ... }] }`
// without having to repeat the other 7 currencies.
function arrayKeyOf(item) {
  return item.code || item.id || item.pair || null;
}

function mergeArrayByKey(base, patchArr) {
  const result = [...base];
  for (const patchItem of patchArr) {
    const key = arrayKeyOf(patchItem);
    if (key == null) { result.push(patchItem); continue; }
    const idx = result.findIndex(x => arrayKeyOf(x) === key);
    if (idx === -1) result.push(patchItem);
    else result[idx] = deepMerge(result[idx], patchItem);
  }
  return result;
}

export function deepMerge(base, patch) {
  if (Array.isArray(patch)) {
    if (Array.isArray(base)) return mergeArrayByKey(base, patch);
    return patch;
  }
  if (patch && typeof patch === 'object') {
    const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = deepMerge(out[k], v);
    }
    return out;
  }
  return patch; // primitive: patch wins
}

export function applyPatch(baseData, patch) {
  return deepMerge(baseData, patch);
}
