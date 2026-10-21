// ---------------------------------------------------------------------------
// Accessibility config
// ---------------------------------------------------------------------------
//
// The chart's screen-reader DESCRIPTION — the text assistive technology reads
// in place of the figure (editor, in-app embed, published embed, SVG export).
// See APPLICATION.md "Accessibility (description)".
//
// `description: null` = "follow the title and subtitle": the description is
// derived live from the authored chart title + subtitle, so editing either
// updates it with no config write. Any string (including "") is the user's
// override.

export type AccessibilityConfig = {
	/** Null = derived from the title and subtitle (`resolveChartDescription`). */
	description: string | null
}

export const DEFAULT_ACCESSIBILITY_CONFIG: AccessibilityConfig = {
	description: null,
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v)

/** Normalize whatever a saved visual / draft slice carries into a full
 *  config. Tolerant of an absent field (visuals saved before the description
 *  existed), a partial object and wrong-typed values — each reads as the
 *  automatic default — so no storage version bump is needed. Idempotent.
 *  An empty string is a deliberate override and survives. */
export const migrateAccessibilityConfig = (
	raw: unknown
): AccessibilityConfig => {
	if (!isRecord(raw)) return { ...DEFAULT_ACCESSIBILITY_CONFIG }
	return {
		description: typeof raw.description === "string" ? raw.description : null,
	}
}

/** Collapse runs of whitespace (a multi-line title reads as one line). */
const clean = (s: string | null | undefined): string =>
	(s ?? "").replace(/\s+/g, " ").trim()

/** Terminate a sentence: leave it alone when it already ends in . ! ? or …
 *  (optionally followed by a closing quote / bracket), else add a period. */
const sentence = (s: string): string =>
	/[.!?…]["'”’)\]]*$/.test(s) ? s : `${s}.`

/** The description the chart carries when the user hasn't written one:
 *  the authored title and subtitle as sentences ("Title. Subtitle."), each
 *  skipped when empty. Uses the AUTHORED text even when the "Titles shown"
 *  checkboxes hide it visually — the description is for readers who can't
 *  see the figure. Empty when both are empty. */
export const autoChartDescription = (texts: {
	title?: string | null
	subtitle?: string | null
}): string =>
	[clean(texts.title), clean(texts.subtitle)]
		.filter((s) => s !== "")
		.map(sentence)
		.join(" ")

/** The text screen readers get for the figure.
 *  - `description` null → `autoChartDescription(title, subtitle)`;
 *  - otherwise the override, trimmed;
 *  - when that comes out empty → the visual's name (trimmed);
 *  - "" only when the name is empty too. */
export const resolveChartDescription = (
	config: AccessibilityConfig | null | undefined,
	texts: {
		title?: string | null
		subtitle?: string | null
		visualName?: string | null
	}
): string => {
	const override = config?.description ?? null
	const text =
		override === null ? autoChartDescription(texts) : override.trim()
	return text !== "" ? text : clean(texts.visualName)
}

/** The figure's short accessible name for the SVG `<title>`: the authored
 *  chart title, else the visual name. */
export const chartAccessibleTitle = (texts: {
	title?: string | null
	visualName?: string | null
}): string => clean(texts.title) || clean(texts.visualName)
