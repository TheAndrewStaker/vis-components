/** Input-modality stamp for the keyboard focus ring (`.vc-focus-ring` in
 * vis-components.css). `:focus-visible` alone isn't enough: a text field
 * matches it on a mouse click too, and the ring must never appear for a
 * mouse user. So <html data-vc-modality> reads "keyboard" after a Tab
 * (Shift+Tab included) and "pointer" after any pointer press — typing into a
 * field you clicked keeps it "pointer". Idempotent. */
export const installFocusModality = (doc: Document = document): void => {
	const root = doc.documentElement
	if (root.dataset.vcModalityInstalled) return
	root.dataset.vcModalityInstalled = "1"
	root.dataset.vcModality = "pointer"
	doc.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Tab") root.dataset.vcModality = "keyboard"
		},
		true
	)
	doc.addEventListener(
		"pointerdown",
		() => {
			root.dataset.vcModality = "pointer"
		},
		true
	)
}
