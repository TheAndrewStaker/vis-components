import { useAtom, useAtomValue } from "jotai"

import { ColorInput } from "../../../../components/ui/ColorInput"
import { Input } from "../../../../components/ui/Input"
import { LABEL_COL, LabelSpacer } from "../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../components/ui/NumberInput"
import { SelectInput } from "../../../../components/ui/SelectInput"
import { Checkbox } from "../../../../components/ui/Checkbox"
import {
	defaultDataTableCaption,
	migrateDataTableConfig,
	type DataTableColumns,
	type DataTableConfig,
	type DataTablePlacement,
} from "../../lib/dataTableConfig"
import { effectiveType } from "../../lib/fieldType"
import { plotsAggregates } from "../../lib/plottedData"
import {
	currentDataTableConfigAtom,
	currentEncodingsAtom,
	currentFieldOverridesAtom,
	currentLabelsAtom,
	currentVisualNameAtom,
} from "../../store/atoms"
import { renderChannelConfigsAtom } from "../../store/renderConfigs"
import { useChartModeDef } from "../../store/useChartModeDef"
import { useCurrentDatasetView } from "../../store/useCurrentDatasetView"
import { useCurrentTheme } from "../../store/useCurrentTheme"
import {
	useFamilyDisplayName,
	useFontFamilyOptions,
} from "../../store/useFontOptions"
import { AlignmentControl } from "./LabelsPanel"

/** Sentinel option value for "inherit the theme's family" — the config
 *  stores null; a `<select>` needs a string. */
const THEME_FAMILY = ""

/** Sidebar panel for the data table under the chart (`DataTableConfig`).
 *  Everything below the master toggle is hidden while the table is off
 *  (inert controls are hidden, not greyed). Styling knobs are sparse:
 *  empty = inherit from the live theme, so each shows the inherited value
 *  as its placeholder. No position nudges — the table sits in page flow
 *  under the chart, outside the layout solver. */
export const DataTablePanel = () => {
	const [stored, setCfg] = useAtom(currentDataTableConfigAtom)
	const cfg = migrateDataTableConfig(stored)
	const theme = useCurrentTheme()
	const title = useAtomValue(currentLabelsAtom).title
	const name = useAtomValue(currentVisualNameAtom)
	const familyOptions = useFontFamilyOptions()
	const familyName = useFamilyDisplayName()
	// Aggregating chart types list their aggregated marks, so "Columns"
	// (encoded vs every variable) has nothing to choose between — hidden.
	const modeId = useChartModeDef().id
	const encodings = useAtomValue(currentEncodingsAtom)
	const channelConfigs = useAtomValue(renderChannelConfigsAtom)
	const overrides = useAtomValue(currentFieldOverridesAtom)
	const view = useCurrentDatasetView()
	const aggregated =
		!!view &&
		plotsAggregates({
			mode: modeId,
			encodings,
			channelConfigs,
			getType: (name) => effectiveType(view, name, overrides),
		})

	const update = (next: Partial<DataTableConfig>) => setCfg({ ...cfg, ...next })
	const textColor = cfg.textColor ?? theme.textFontColor

	return (
		<div className="vc-option-panel">
			<Checkbox
				label="Show a data table under the chart"
				checked={cfg.enabled}
				onChange={(enabled) => update({ enabled })}
			/>

			{cfg.enabled && (
				<>
					<p className="vc-help">
						An HTML table of the chart&apos;s data as the screen-reader
						alternative to the figure. Not part of image exports.
					</p>
					<SelectInput<DataTablePlacement>
						label="Placement"
						labelClassName={LABEL_COL}
						value={cfg.placement}
						options={[
							{ value: "below", label: "Below the chart" },
							{ value: "button", label: "Behind a button" },
						]}
						onChange={(placement) => update({ placement })}
						selectClassName="flex-1"
					/>
					<label className="flex items-center gap-2 text-sm">
						<span className={`${LABEL_COL} shrink-0`}>Caption</span>
						<Input
							className="flex-1"
							value={cfg.caption ?? ""}
							placeholder={defaultDataTableCaption(title, name)}
							onChange={(e) =>
								update({ caption: e.target.value === "" ? null : e.target.value })
							}
						/>
					</label>
					{aggregated ? (
						<p className="vc-help">
							This chart type aggregates its data, so the table lists the
							plotted values.
						</p>
					) : (
						<SelectInput<DataTableColumns>
							label="Columns"
							labelClassName={LABEL_COL}
							value={cfg.columns}
							options={[
								{ value: "encoded", label: "Encoded variables only" },
								{ value: "all", label: "All variables" },
							]}
							onChange={(columns) => update({ columns })}
							selectClassName="flex-1"
						/>
					)}
					<NumberInput
						label="Max rows"
						labelClassName={LABEL_COL}
						value={cfg.maxRows}
						placeholder="All"
						min={1}
						step={1}
						stepBase={10}
						onChange={(n) => {
							if (n >= 1) update({ maxRows: Math.round(n) })
						}}
						onClear={() => update({ maxRows: null })}
						inputClassName="w-20"
					/>
					<div className="flex items-center gap-2">
						<LabelSpacer />
						<Checkbox
							label="Download link"
							checked={cfg.showDownload}
							onChange={(showDownload) => update({ showDownload })}
						/>
					</div>

					<div className="vc-divider-group">
						<span className="vc-group-header">Table text</span>
						<SelectInput
							label="Family"
							labelClassName={LABEL_COL}
							value={cfg.fontFamily ?? THEME_FAMILY}
							options={[
								{
									value: THEME_FAMILY,
									label: `Theme (${familyName(theme.textFontFamily)})`,
								},
								...familyOptions,
							]}
							onChange={(v) => update({ fontFamily: v === THEME_FAMILY ? null : v })}
							selectClassName="flex-1"
						/>
						<NumberInput
							label="Size"
							labelClassName={LABEL_COL}
							value={cfg.fontSize}
							placeholder={String(theme.textFontSize)}
							stepBase={theme.textFontSize}
							min={1}
							step={1}
							suffix="pt"
							onChange={(n) => {
								if (n > 0) update({ fontSize: n })
							}}
							onClear={() => update({ fontSize: null })}
							inputClassName="w-20"
						/>
						<ColorInput
							label="Color"
							labelClassName={LABEL_COL}
							value={cfg.textColor}
							placeholder={theme.textFontColor}
							onChange={(c) => update({ textColor: c })}
							onClear={() => update({ textColor: null })}
							paletteKind="text"
						/>
					</div>

					<div className="vc-divider-group">
						<span className="vc-group-header">Header</span>
						<ColorInput
							label="Background"
							labelClassName={LABEL_COL}
							value={cfg.headerBackground}
							placeholder="(none)"
							onChange={(c) => update({ headerBackground: c })}
							onClear={() => update({ headerBackground: null })}
						/>
						<ColorInput
							label="Text color"
							labelClassName={LABEL_COL}
							value={cfg.headerTextColor}
							placeholder={textColor}
							onChange={(c) => update({ headerTextColor: c })}
							onClear={() => update({ headerTextColor: null })}
							paletteKind="text"
						/>
						<div className="flex items-center gap-2">
							<LabelSpacer />
							<Checkbox
								label="Bold"
								checked={cfg.headerBold}
								onChange={(headerBold) => update({ headerBold })}
							/>
						</div>
					</div>

					<div className="vc-divider-group">
						<span className="vc-group-header">Rows</span>
						<ColorInput
							label="Border color"
							labelClassName={LABEL_COL}
							value={cfg.borderColor}
							placeholder="(auto)"
							onChange={(c) => update({ borderColor: c })}
							onClear={() => update({ borderColor: null })}
						/>
						<div className="flex items-center gap-2">
							<LabelSpacer />
							<Checkbox
								label="Striped rows"
								checked={cfg.striped}
								onChange={(striped) => update({ striped })}
							/>
						</div>
						{cfg.striped && (
							<ColorInput
								label="Stripe color"
								labelClassName={LABEL_COL}
								value={cfg.stripeColor}
								placeholder="(auto)"
								onChange={(c) => update({ stripeColor: c })}
								onClear={() => update({ stripeColor: null })}
							/>
						)}
						{/* div, not label: AlignmentControl is a button group, not a form control */}
						<div className="flex items-center gap-2 text-sm">
							<span className={LABEL_COL}>Numbers</span>
							<AlignmentControl
								value={cfg.numberAlign}
								onChange={(numberAlign) => update({ numberAlign })}
							/>
						</div>
					</div>
				</>
			)}
		</div>
	)
}
