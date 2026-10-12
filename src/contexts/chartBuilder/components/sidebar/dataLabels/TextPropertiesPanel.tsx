import type {
	DataLabelsConfig,
	LabelFontOverrides,
} from "../../../lib/channelConfig"
import { fontWeightOptionsFor } from "../../../lib/labelsConfig"
import {
	useFontFamilyOptions,
	useUserFontWeights,
} from "../../../store/useFontOptions"

import { CollapsibleSubsection } from "../../../../../components/ui/CollapsibleSubsection"
import { LABEL_COL } from "../../../../../components/ui/LabeledField"
import { ResetLink } from "../../../../../components/ui/ResetLink"
import { SelectInput } from "../../../../../components/ui/SelectInput"
import { StyleButton } from "../LabelsPanel"

/** One Family / Weight / Style control group. The layer-wide panel and
 *  each per-variable block render the same controls; they differ only in
 *  what they read and write. `reset*` renders the control's reset link
 *  when it returns a handler. */
const FontControls = ({
	fontFamily,
	fontWeight,
	italic,
	underline,
	onChange,
	resetFamily,
	resetWeight,
	resetStyle,
	nameSuffix = "",
}: {
	fontFamily: string
	fontWeight: number
	italic: boolean
	underline: boolean
	onChange: (p: LabelFontOverrides) => void
	resetFamily: (() => void) | null
	resetWeight: (() => void) | null
	resetStyle: (() => void) | null
	/** Appended to the style buttons' a11y labels so several blocks in one
	 *  panel stay distinguishable (" (field)"). */
	nameSuffix?: string
}) => {
	const familyOptions = useFontFamilyOptions()
	const userFontWeights = useUserFontWeights()
	return (
		<>
			<div className="flex items-center gap-2">
				<SelectInput
					label="Family"
					labelClassName={LABEL_COL}
					value={fontFamily}
					options={familyOptions}
					onChange={(v) => onChange({ fontFamily: v })}
					selectClassName="flex-1"
				/>
				{resetFamily && <ResetLink onClick={resetFamily} />}
			</div>
			<div className="flex items-center gap-2">
				<SelectInput
					label="Weight"
					labelClassName={LABEL_COL}
					value={String(fontWeight)}
					options={fontWeightOptionsFor(
						fontFamily,
						fontWeight,
						userFontWeights
					).map((w) => ({ value: String(w.value), label: w.label }))}
					onChange={(w) => onChange({ fontWeight: Number(w) })}
					selectClassName="flex-1"
				/>
				{resetWeight && <ResetLink onClick={resetWeight} />}
			</div>
			<div className="flex items-center gap-1.5">
				<span className={`${LABEL_COL} shrink-0 text-sm`}>Style</span>
				<StyleButton
					on={italic}
					label="I"
					className="italic"
					ariaLabel={`Italic${nameSuffix}`}
					onClick={() => onChange({ italic: !italic })}
				/>
				<StyleButton
					on={underline}
					label="U"
					className="underline"
					ariaLabel={`Underline${nameSuffix}`}
					onClick={() => onChange({ underline: !underline })}
				/>
				{resetStyle && <ResetLink onClick={resetStyle} />}
			</div>
		</>
	)
}

// ---------------------------------------------------------------------------
// Text properties — font family / weight / style (italic, underline).
// Grouped in their own purple subsection; the per-channel panels keep only
// the settings scoped to their channel. With two or more label variables
// the layer-wide controls stand down and each variable gets its own
// collapsible block (like the Color panel's slots): the block shows the
// variable's effective values — its own, else the layer's — and writes the
// variable's entry; a reset link drops a control back to the layer value.
// ---------------------------------------------------------------------------
export const TextPropertiesPanel = ({
	cfg,
	onChange,
	themeDefaults,
	multiFields = [],
}: {
	cfg: DataLabelsConfig
	onChange: (patch: Partial<DataLabelsConfig>) => void
	/** Theme-seeded baseline (`dataLabelsConfigFromTheme`) — the weight and
	 *  style reset links compare against and restore the THEME's defaults. */
	themeDefaults: DataLabelsConfig
	/** Multi-field label variables (two or more). Each gets its own
	 *  Family / Weight / Style block in place of the layer-wide one; empty
	 *  in single-field mode. */
	multiFields?: string[]
}) => {
	if (multiFields.length === 0) {
		const styleChanged =
			(cfg.italic ?? false) !== (themeDefaults.italic ?? false) ||
			(cfg.underline ?? false) !== (themeDefaults.underline ?? false)
		return (
			<div className="flex flex-col gap-2">
				<FontControls
					fontFamily={cfg.fontFamily}
					fontWeight={cfg.fontWeight}
					italic={cfg.italic === true}
					underline={cfg.underline === true}
					onChange={(p) => onChange(p)}
					resetFamily={
						cfg.fontFamily !== themeDefaults.fontFamily
							? () => onChange({ fontFamily: themeDefaults.fontFamily })
							: null
					}
					resetWeight={
						cfg.fontWeight !== themeDefaults.fontWeight
							? () => onChange({ fontWeight: themeDefaults.fontWeight })
							: null
					}
					resetStyle={
						styleChanged
							? () =>
									onChange({
										italic: themeDefaults.italic ?? false,
										underline: themeDefaults.underline ?? false,
									})
							: null
					}
				/>
			</div>
		)
	}
	return (
		<div className="flex flex-col gap-2">
			{multiFields.map((name) => {
				const own: LabelFontOverrides = cfg.fieldFonts?.[name] ?? {}
				const configured = Object.keys(own).length > 0
				const write = (next: LabelFontOverrides) => {
					const map = { ...(cfg.fieldFonts ?? {}) }
					if (Object.keys(next).length === 0) delete map[name]
					else map[name] = next
					onChange({ fieldFonts: map })
				}
				const unset = (...keys: (keyof LabelFontOverrides)[]) => {
					const next = { ...own }
					for (const k of keys) delete next[k]
					write(next)
				}
				return (
					<CollapsibleSubsection key={name} title={name} changed={configured}>
						<FontControls
							fontFamily={own.fontFamily ?? cfg.fontFamily}
							fontWeight={own.fontWeight ?? cfg.fontWeight}
							italic={own.italic ?? cfg.italic ?? false}
							underline={own.underline ?? cfg.underline ?? false}
							onChange={(p) => write({ ...own, ...p })}
							resetFamily={
								own.fontFamily !== undefined ? () => unset("fontFamily") : null
							}
							resetWeight={
								own.fontWeight !== undefined ? () => unset("fontWeight") : null
							}
							resetStyle={
								own.italic !== undefined || own.underline !== undefined
									? () => unset("italic", "underline")
									: null
							}
							nameSuffix={` (${name})`}
						/>
					</CollapsibleSubsection>
				)
			})}
		</div>
	)
}
