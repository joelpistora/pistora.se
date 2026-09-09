/**
 * Encode a client-supplied path for the `/api/files/*` and `/api/dirs/*`
 * wildcard segment. Accepts `"a/b/c.txt"` or `"/a/b/c.txt"`; encodes each
 * segment and rejoins with literal `/` (the API's wildcard param captures
 * slashes). Empty and `"."` segments are dropped; `""` → `""` (the storage root).
 *
 * Throws on a `".."` segment: `fetch()` collapses `..` in a URL path before the
 * request leaves, so it would never reach the API's `storage.resolve()` guard —
 * the caller would see a confusing 404 instead of a path rejection. Traversal is
 * a client-side bug, so fail loudly here. Path safety on the wire is still the
 * API's job; this is just DX.
 */
export function encodePath(p: string): string {
  return p
    .split("/")
    .filter((s) => s.length > 0 && s !== ".")
    .map((s) => {
      if (s === "..") {
        throw new RangeError(`invalid path segment ".." in ${JSON.stringify(p)}`);
      }
      return encodeURIComponent(s);
    })
    .join("/");
}
