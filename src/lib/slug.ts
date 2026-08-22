/**
 * URL SLUGS FOR JURISDICTIONS
 *
 * County names contain apostrophes, spaces and the word "County" itself
 * ("Prince George's County"), so the slug rule lives here once.
 *
 * This is the single canonical rule. Public search result links, the coverage
 * index, the per-state pages and the per-county pages all derive their URLs from
 * it, so a link produced by one surface always resolves on another. Matching is
 * done by comparing slugs rather than by trying to reconstruct the original name,
 * which would be lossy.
 */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The slug used for a jurisdiction's county segment.
 *
 * The trailing "County" is dropped because the URL already sits under a state
 * segment and the word carries no distinguishing information. County equivalents
 * that are not called "County" (parishes, boroughs, independent cities) keep their
 * full name.
 */
export function countySlug(county: string | undefined): string {
  return slugify((county ?? "statewide").replace(/\s+county$/i, ""));
}
