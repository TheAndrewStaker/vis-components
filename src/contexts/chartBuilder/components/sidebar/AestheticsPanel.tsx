import { useAtom, useAtomValue } from "jotai"
import { Checkbox } from "../../../../components/ui/Checkbox"
import { CollapsibleSubsection } from "../../../../components/ui/CollapsibleSubsection"
import { ColorInput } from "../../../../components/ui/ColorInput"
import { LABEL_COL } from "../../../../components/ui/LabeledField"
import { NumberInput } from "../../../../components/ui/NumberInput"
import { ResetLink } from "../../../../components/ui/ResetLink"
import {
	CANVAS_SIDES,
	withCanvasMargin,
	type AspectRatioConfig,
	type CanvasSide,
	type CanvasSizeConfig,
} from "../../lib/channelConfig"
import {
	pxToUnit,
	unitToPx,
	UNIT_OPTIONS,
	UNIT_STEP,
	type DisplayUnit,
} from "../../lib/displayUnits"
import type { DrawOrderConfig } from "../../lib/drawOrder"
import {
	currentChannelConfigsAtom,
	currentRenderedCanvasSlackAtom,
} from "../../store/atoms"
import { useCurrentTheme } from "../../store/useCurrentTheme"
import { useCurrentDatasetView } from "../../store/useCurrentDatasetView"
import { Select } from "../../../../components/ui/Select"

// Smallest usable canvas edge, in px (matches the Export modal's floor).
const MIN_CANVAS_DIM = 50
// What "Set canvas size" seeds (px) — also the Width / Height reset target.
const DEFAULT_CANVAS_WIDTH = 1000
const DEFAULT_CANVAS_HEIGHT = 600

const SIDE_LABEL: Record<CanvasSide, string> = {
	top: "Top",
	right: "Right",
	bottom: "Bottom",
	left: "Left",
}

/** Per-visual aesthetic settings that don't fit neatly under a single
 * encoding channel. */
export const AestheticsPanel = () => {
	const [configs, setConfigs] = useAtom(currentChannelConfigsAtom)
	const theme = useCurrentTheme()
	const dataset = useCurrentDatasetView()
	const current = configs.backgroundColor ?? null
	const themeDefault = theme.chartBackgroundColor ?? null
	const scrollMode = configs.scrollMode ?? "fit"
	const drawOrder = configs.drawOrder ?? null
	const fields = dataset?.fields ?? []

	const setBg = (next: string | null) =>
		setConfigs((prev) => ({ ...prev, backgroundColor: next }))

	const setScrollMode = (next: "fit" | "scroll") =>
		setConfigs((prev) => ({ ...prev, scrollMode: next }))

	const setDrawOrder = (next: DrawOrderConfig | null) =>
		setConfigs((prev) => ({ ...prev, drawOrder: next }))

	const axesBehindMarks = configs.axesBehindMarks ?? false
	const setAxesBehindMarks = (next: boolean) =>
		setConfigs((prev) => ({ ...prev, axesBehindMarks: next || undefined }))

	const aspect = configs.aspectRatio ?? null
	const setAspect = (next: AspectRatioConfig | null) =>
		setConfigs((prev) => ({ ...prev, aspectRatio: next ?? undefined }))

	const canvasSize = configs.canvasSize ?? null
	const canvasUnit = canvasSize?.unit ?? "px"
	const setCanvasSize = (next: CanvasSizeConfig | null) =>
		setConfigs((prev) => ({ ...prev, canvasSize: next ?? undefined }))
	// White space the layout currently leaves on each side of the fixed
	// canvas (measured by ChartCanvas's margin frame) — the margin inputs'
	// "auto" placeholder, so stepping starts from what's on screen.
	const canvasSlack = useAtomValue(currentRenderedCanvasSlackAtom)
	const setCanvasMargin = (side: CanvasSide, px: number | null) =>
		setConfigs((prev) => {
			const cs = prev.canvasSize
			if (!cs) return prev
			return {
				...prev,
				canvasSize: { ...cs, margins: withCanvasMargin(cs.margins, side, px) },
			}
		})

	// Subsection "changed" dots. Fresh charts seed backgroundColor from the
	// theme (channelConfigsFromTheme), so the theme is the background's
	// baseline; the rest have fixed defaults (fit / no ratio / dataset order).
	// Aspect length/width are gated behind the enable toggle, so the toggle
	// alone decides that dot.
	const backgroundChanged = current !== themeDefault
	// Canvas-size width/height are gated behind the enable toggle (like
	// aspect ratio's inputs), so the toggle alone decides its half of the dot.
	const canvasChanged = scrollMode !== "fit" || canvasSize?.enabled === true
	const aspectChanged = aspect?.enabled === true
	const drawOrderChanged = drawOrder !== null || axesBehindMarks

	return (
		<>
			<CollapsibleSubsection title="Chart background" changed={backgroundChanged}>
				<div className="flex flex-col gap-2">
					<label className="flex items-center gap-2 text-sm">
						<input
							type="radio"
							checked={current === null}
							onChange={() => setBg(null)}
						/>
						<span className="vc-text">
							Transparent (host page shows through)
						</span>
					</label>
					{themeDefault !== null && (
						<label className="flex items-center gap-2 text-sm">
							<input
								type="radio"
								checked={current === themeDefault}
								onChange={() => setBg(themeDefault)}
							/>
							<span className="vc-text">
								Theme default ({themeDefault})
							</span>
						</label>
					)}
					<label className="flex items-center gap-2 text-sm">
						<input
							type="radio"
							checked={current !== null && current !== themeDefault}
							onChange={() => setBg(current ?? "#ffffff")}
						/>
						<span className="vc-text">Custom</span>
					</label>
					{current !== null && current !== themeDefault && (
						<ColorInput
							label="Color"
							labelClassName={LABEL_COL}
							value={current}
							onChange={setBg}
						/>
					)}
				</div>
			</CollapsibleSubsection>
			<CollapsibleSubsection title="Canvas size" changed={canvasChanged}>
				<div className="flex flex-col gap-2">
					<Checkbox
						label="Set canvas size"
						checked={canvasSize?.enabled ?? false}
						onChange={(enabled) =>
							setCanvasSize({
								enabled,
								width: canvasSize?.width ?? DEFAULT_CANVAS_WIDTH,
								height: canvasSize?.height ?? DEFAULT_CANVAS_HEIGHT,
								unit: canvasSize?.unit,
							})
						}
					/>
					{canvasSize?.enabled && (
						<>
							<label className="flex items-center gap-2 text-sm">
								<span className={`shrink-0 ${LABEL_COL}`}>Units</span>
								<Select
									value={canvasUnit}
									onChange={(e) =>
										setCanvasSize({
											...canvasSize,
											unit: e.target.value as DisplayUnit,
										})
									}
									className="flex-1"
								>
									{UNIT_OPTIONS.map((u) => (
										<option key={u} value={u}>
											{u}
										</option>
									))}
								</Select>
							</label>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Width"
									labelClassName={LABEL_COL}
									value={pxToUnit(canvasSize.width, canvasUnit)}
									onChange={(v) =>
										setCanvasSize({
											...canvasSize,
											// Preserve the raw input's guard: an all-cleared / zero
											// entry falls back to the default rather than committing 0.
											width: unitToPx(v, canvasUnit) || DEFAULT_CANVAS_WIDTH,
										})
									}
									min={pxToUnit(MIN_CANVAS_DIM, canvasUnit)}
									step={UNIT_STEP[canvasUnit]}
									clamp
									suffix={canvasUnit}
								/>
								{canvasSize.width !== DEFAULT_CANVAS_WIDTH && (
									<ResetLink
										ariaLabel="Reset canvas width"
										onClick={() =>
											setCanvasSize({ ...canvasSize, width: DEFAULT_CANVAS_WIDTH })
										}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Height"
									labelClassName={LABEL_COL}
									value={pxToUnit(canvasSize.height, canvasUnit)}
									onChange={(v) =>
										setCanvasSize({
											...canvasSize,
											height: unitToPx(v, canvasUnit) || DEFAULT_CANVAS_HEIGHT,
										})
									}
									min={pxToUnit(MIN_CANVAS_DIM, canvasUnit)}
									step={UNIT_STEP[canvasUnit]}
									clamp
									suffix={canvasUnit}
								/>
								{canvasSize.height !== DEFAULT_CANVAS_HEIGHT && (
									<ResetLink
										ariaLabel="Reset canvas height"
										onClick={() =>
											setCanvasSize({ ...canvasSize, height: DEFAULT_CANVAS_HEIGHT })
										}
									/>
								)}
							</div>
						</>
					)}
				</div>
				{canvasSize?.enabled && (
					<div className="vc-divider-group" data-canvas-margins>
						<span className="vc-group-header">Margins</span>
						{CANVAS_SIDES.map((side) => {
							const px = canvasSize.margins?.[side]
							// Blank = inherit: the theme's Exporting default when it has
							// one (the placeholder shows it), else whatever white space
							// the layout leaves (the measured amount).
							const themePx = theme.exportCanvasMargins?.[side]
							const placeholder =
								themePx != null
									? String(pxToUnit(themePx, canvasUnit))
									: canvasSlack
										? String(pxToUnit(canvasSlack[side], canvasUnit))
										: "auto"
							return (
								<div key={side} className="flex items-center gap-2">
								<NumberInput
									label={SIDE_LABEL[side]}
									labelClassName={LABEL_COL}
									value={px == null ? null : pxToUnit(px, canvasUnit)}
									onChange={(v) =>
										setCanvasMargin(side, Math.max(0, unitToPx(v, canvasUnit)))
									}
									onClear={() => setCanvasMargin(side, null)}
									placeholder={placeholder}
									stepBase={0}
									min={0}
									step={UNIT_STEP[canvasUnit]}
									clamp
									suffix={canvasUnit}
									changed={px != null && px !== themePx}
								/>
								{/* Reset = clear to inherit (theme default / auto). */}
								{px != null && (
									<ResetLink
										ariaLabel={`Reset ${SIDE_LABEL[side].toLowerCase()} margin`}
										onClick={() => setCanvasMargin(side, null)}
									/>
								)}
								</div>
							)
						})}
					</div>
				)}
				<div className="vc-divider-group">
					<Checkbox
						label="Allow scrolling for tall/wide charts"
						checked={scrollMode === "scroll"}
						onChange={(on) => setScrollMode(on ? "scroll" : "fit")}
					/>
				</div>
			</CollapsibleSubsection>
			<CollapsibleSubsection title="Aspect ratio" changed={aspectChanged}>
				<div className="flex flex-col gap-2">
					<Checkbox
						label="Fix aspect ratio"
						checked={aspect?.enabled ?? false}
						onChange={(enabled) =>
							setAspect({
								enabled,
								length: aspect?.length ?? 1,
								width: aspect?.width ?? 1,
							})
						}
					/>
					{aspect?.enabled && (
						<>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Width"
									labelClassName={LABEL_COL}
									value={aspect.width}
									onChange={(width) => setAspect({ ...aspect, width })}
									min={0.1}
									step={0.1}
									clamp
								/>
								{aspect.width !== 1 && (
									<ResetLink
										ariaLabel="Reset aspect width"
										onClick={() => setAspect({ ...aspect, width: 1 })}
									/>
								)}
							</div>
							<div className="flex items-center gap-2">
								<NumberInput
									label="Height"
									labelClassName={LABEL_COL}
									value={aspect.length}
									onChange={(length) => setAspect({ ...aspect, length })}
									min={0.1}
									step={0.1}
									clamp
								/>
								{aspect.length !== 1 && (
									<ResetLink
										ariaLabel="Reset aspect height"
										onClick={() => setAspect({ ...aspect, length: 1 })}
									/>
								)}
							</div>
						</>
					)}
					<p className="vc-help">
						Keeps every panel&apos;s plot area at a set width-to-height shape
						no matter the viewport size. 1:1 makes the axes equal length. Faceted charts apply the
						shape to each panel. Overrides Panel spacing and sizing in
						Facet, proportional panel weights, and
						scroll-mode panel minimums.
					</p>
				</div>
			</CollapsibleSubsection>
			<CollapsibleSubsection title="Draw order" changed={drawOrderChanged}>
				<div className="flex flex-col gap-2">
					<label className="flex items-center gap-2 text-sm">
						<span className={`shrink-0 ${LABEL_COL}`}>
							Sort by
						</span>
						<Select
							value={drawOrder?.field ?? ""}
							onChange={(e) =>
								setDrawOrder(
									e.target.value === ""
										? null
										: { dir: "asc", ...drawOrder, field: e.target.value }
								)
							}
							className="flex-1"
						>
							<option value="">Dataset order (default)</option>
							{drawOrder !== null &&
								!fields.some((f) => f.name === drawOrder.field) && (
									<option value={drawOrder.field}>
										{drawOrder.field} (not in dataset)
									</option>
								)}
							{fields.map((f) => (
								<option key={f.name} value={f.name}>
									{f.name}
								</option>
							))}
						</Select>
					</label>
					{drawOrder !== null && (
						<label className="flex items-center gap-2 text-sm">
							<span className={`shrink-0 ${LABEL_COL}`}>
								Direction
							</span>
							<Select
								value={drawOrder.dir}
								onChange={(e) =>
									setDrawOrder({
										...drawOrder,
										dir: e.target.value as "asc" | "desc",
									})
								}
								className="flex-1"
							>
								<option value="asc">Ascending — highest on top</option>
								<option value="desc">Descending — lowest on top</option>
							</Select>
						</label>
					)}
					<p className="vc-help">
						Dataset order draws later rows on top. Sorting only affects
						the drawing order, never the data.
					</p>
					<div className="vc-divider-group">
						<Checkbox
							label="Draw axes behind marks"
							checked={axesBehindMarks}
							onChange={setAxesBehindMarks}
						/>
					</div>
				</div>
			</CollapsibleSubsection>
		</>
	)
}
