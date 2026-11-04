import { ColorInput, Section, SectionGroup, THEME_LABEL_CLASS } from "./controls"
import { ColorInput as UiColorInput } from "../../../../components/ui/ColorInput"
import { updateCategoricalPalette } from "./paletteHelpers"
import type { ThemeSectionProps } from "./types"

export const PatternsSection = ({
	theme,
	set,
	isReadOnly,
}: ThemeSectionProps) => (
	<SectionGroup title="Patterns" isReadOnly={isReadOnly}>
		{/* Pattern defaults */}
		<Section title="Pattern">
			<p className="text-sm vc-muted">
				Patterns sit on each mark&apos;s own color; the ink pairs with that
				color through the per-palette overrides below, else the Ink color.
				Background, when set, replaces the mark color under the pattern on
				marks with no hue mapping.
			</p>
			<ColorInput
				label="Ink color"
				value={theme.patternInkColor}
				onChange={(v) => set("patternInkColor", v)}
			/>
			{/* Inherit mode: empty = the mark's fill, previewed in the swatch. */}
			<UiColorInput
				label="Background"
				labelClassName={THEME_LABEL_CLASS}
				showPalettePicker={false}
				value={theme.patternBackgroundColor ?? null}
				onChange={(v) => set("patternBackgroundColor", v)}
				onClear={() => set("patternBackgroundColor", null)}
				placeholder={theme.defaultFill}
			/>
			{theme.categoricalPalettes.length > 0 && (
				<div className="mt-2 flex flex-col gap-3">
					<span className="text-sm font-medium vc-text">
						Per-hue ink overrides
					</span>
					{theme.categoricalPalettes.map((palette) => (
						<div
							key={palette.id}
							className="rounded-md border border-stone-200 p-3 dark:border-stone-700"
						>
							<div className="mb-2 text-sm font-medium vc-text">
								{palette.name}
							</div>
							<div className="flex flex-wrap gap-2">
								{palette.colors.map((color, i) => {
									const inkArray = palette.patternInks ?? []
									const ink = inkArray[i] ?? ""
									const setInk = (next: string | null) => {
										const updated = [...inkArray]
										while (updated.length < palette.colors.length) {
											updated.push(null)
										}
										updated[i] = next
										updateCategoricalPalette(theme, set, palette.id, {
											patternInks: updated,
										})
									}
									return (
										<div
											// eslint-disable-next-line react/no-array-index-key
											key={i}
											className="flex flex-col items-center gap-1"
										>
											<span
												className="block h-6 w-10 rounded border border-stone-300 dark:border-stone-700"
												style={{ backgroundColor: color }}
												aria-label={`Hue swatch ${i + 1}`}
											/>
											{/* Inherit mode: no ink = the global ink, previewed behind
											 *  the primitive's dashed "inherited" border. Swatch-only
											 *  (the hue swatch above is the row's label) and, as on
											 *  every theme-editor swatch, no palette picker. */}
											<UiColorInput
												label={`Pattern ink for hue ${i + 1}`}
												labelClassName="sr-only"
												value={ink || null}
												onChange={setInk}
												placeholder={theme.patternInkColor}
												showHexInput={false}
												showPalettePicker={false}
											/>
											{ink && (
												<button
													type="button"
													onClick={() => setInk(null)}
													className="text-xs leading-none underline hover:text-stone-900 dark:hover:text-white vc-muted"
													title="Reset to global default"
												>
													reset
												</button>
											)}
										</div>
									)
								})}
							</div>
						</div>
					))}
				</div>
			)}
		</Section>
	</SectionGroup>
)
