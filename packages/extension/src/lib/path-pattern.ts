/**
 * Derive a wildcard path pattern from a concrete path by replacing segments that
 * look dynamic (numeric ids, UUIDs, long hashes) with `*`. The author can edit
 * the result before saving. Mirrors the backend's `*`-per-segment matcher.
 */
export function toPattern(path: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const segments = path.split('/').map((seg) => {
    if (!seg) return seg;
    if (/^\d+$/.test(seg)) return '*'; // pure numeric id
    if (uuid.test(seg)) return '*';
    if (/[0-9a-f]{12,}/i.test(seg)) return '*'; // long hex/hash
    return seg;
  });

  return segments.join('/') || '/';
}
