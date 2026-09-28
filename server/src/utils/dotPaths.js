/**
 * Turns `{ returns: { windowDays: 10 } }` into `{ 'returns.windowDays': 10 }`
 * for the named groups, so a `$set` updates those fields and leaves the rest
 * of the group alone. A whole-object `$set` would replace the group and reset
 * every field the caller did not send.
 */
export function toDotPaths(payload, groups) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    const isGroup = groups.includes(key) && value && typeof value === 'object' && !Array.isArray(value);
    if (!isGroup) {
      out[key] = value;
      continue;
    }
    for (const [field, fieldValue] of Object.entries(value)) out[`${key}.${field}`] = fieldValue;
  }
  return out;
}

export default toDotPaths;
