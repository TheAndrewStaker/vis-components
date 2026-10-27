import {
	DEFAULT_DATA_LABELS_CONFIG,
	type DataLabelsConfig,
} from "../../../lib/channelConfig"

import { labelEntry, withLabelEntry } from "../../../lib/labelPieces"
import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import { LABEL_COL } from "../../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../../components/ui/ResetLink"

// ---------------------------------------------------------------------------
// Size panel — a fixed default font size, plus the min/max pixel range the
// labels lerp across when a size field is mapped. Min / Max only render
// with a mapped size source (field or derived depth) — without one they'd
// be inert knobs. With two or more label variables, the layer-wide Default
// size hides and each variable gets its own Size below (blank = the
// theme's default, or the mapped size), mirroring the Color panel's
// per-variable slots — the user sizes each variable where it's named
// rather than through a shared knob.
// ---------------------------------------------------------------------------
export const SizePanel = ({
	cfg,
	onChange,
	themeDefaults,
	sizeMapped = false,
	multiFields = [],
	titles,
	splitToggle,
	keysFor,
}: {
	cfg: DataLabelsConfig
	onChange: (patch: Partial<DataLabelsConfig>) => void
	/** Theme-seeded baseline (`dataLabelsConfigFromTheme`) — the Default
	 *  size reset link compares against and restores the THEME's size. */
	themeDefaults: DataLabelsConfig
	/** True when the Size dropdown has a source (a field or the derived
	 *  "Nesting depth") — gates the Min / Max range inputs. */
	sizeMapped?: boolean
	/** Multi-field label variables (two or more). Each gets its own Size
	 *  input; empty in single-field mode. */
	multiFields?: string[]
	/** Section titles by key (a combination shows its variables joined with
	 *  " + "); a key without one is titled by the key itself. */
	titles?: Record<string, string>
	/** The "Split into individual variables" toggle for one label, rendered
	 *  above its controls; `null` for a label with fewer than two variables
	 *  (nothing to split). */
	splitToggle?: (key: string) => React.ReactNode
	/** The keys one label's controls write to: just the label (styled as
	 *  one), or one key per variable when its Size is split. */
	keysFor?: (key: string) => string[]
}) => (
	<div className="flex flex-col gap-2">
		{multiFields.length === 0 && (
			<div className="flex items-center gap-2">
				<NumberInput
					label="Default size"
					labelClassName={LABEL_COL}
					value={cfg.fontSize}
					min={6}
					max={64}
					step={1}
					onChange={(fontSize) => onChange({ fontSize })}
					inputClassName="w-16"
					suffix="pt"
				/>
				{cfg.fontSize !== themeDefaults.fontSize && (
					<ResetLink
						onClick={() => onChange({ fontSize: themeDefaults.fontSize })}
					/>
				)}
			</div>
		)}
		{sizeMapped && (
			<>
				<div className="flex items-center gap-2">
					<NumberInput
						label="Min"
						labelClassName={LABEL_COL}
						value={cfg.sizeMin}
						min={4}
						max={64}
						step={1}
						onChange={(sizeMin) => onChange({ sizeMin })}
						inputClassName="w-16"
						suffix="pt"
					/>
					{cfg.sizeMin !== DEFAULT_DATA_LABELS_CONFIG.sizeMin && (
						<ResetLink
							onClick={() =>
								onChange({ sizeMin: DEFAULT_DATA_LABELS_CONFIG.sizeMin })
							}
						/>
					)}
				</div>
				<div className="flex items-center gap-2">
					<NumberInput
						label="Max"
						labelClassName={LABEL_COL}
						value={cfg.sizeMax}
						min={4}
						max={128}
						step={1}
						onChange={(sizeMax) => onChange({ sizeMax })}
						inputClassName="w-16"
						suffix="pt"
					/>
					{cfg.sizeMax !== DEFAULT_DATA_LABELS_CONFIG.sizeMax && (
						<ResetLink
							onClick={() =>
								onChange({ sizeMax: DEFAULT_DATA_LABELS_CONFIG.sizeMax })
							}
						/>
					)}
				</div>
			</>
		)}
		{multiFields.length > 0 && (
			/* The hairline + top pad only earn their keep when something
			 *  renders above them. With two or more variables the layer-wide
			 *  Default size is hidden, so an unmapped Size channel leaves the
			 *  per-variable slots as the panel's only content — a divider
			 *  there is a stray rule with a gap under it. Mirrors the Color
			 *  panel's per-variable slots. */
			<div
				className={sizeMapped ? "vc-divider-group" : "flex flex-col gap-2"}
			>
				{multiFields.map((name) => {
					// Split → one row per variable, each labeled by its name;
					// unsplit → the label's single Size row. The rows are the
					// same control either way, just a different key.
					const keys = keysFor?.(name) ?? [name]
					const split = keys.length > 1 || keys[0] !== name
					const clear = (key: string) => () =>
						onChange(withLabelEntry(cfg, "fieldSizes", key, undefined))
					return (
						<CollapsibleSubsection
							key={name}
							title={titles?.[name] ?? name}
							changed={keys.some(
								(k) => labelEntry(cfg, "fieldSizes", k) != null
							)}
						>
							{splitToggle?.(name)}
							{keys.map((key) => {
								const own = labelEntry(cfg, "fieldSizes", key) ?? null
								return (
									<div key={key} className="flex items-center gap-2">
										<NumberInput
											label={split ? (titles?.[key] ?? key) : "Size"}
											labelClassName={LABEL_COL}
											value={own}
											onClear={clear(key)}
											placeholder={
												sizeMapped ? "mapped" : String(cfg.fontSize)
											}
											stepBase={cfg.fontSize}
											min={4}
											max={128}
											step={1}
											onChange={(pt) =>
												onChange(withLabelEntry(cfg, "fieldSizes", key, pt))
											}
											inputClassName="w-16"
											suffix="pt"
										/>
										{own != null && <ResetLink onClick={clear(key)} />}
									</div>
								)
							})}
						</CollapsibleSubsection>
					)
				})}
			</div>
		)}
	</div>
)
