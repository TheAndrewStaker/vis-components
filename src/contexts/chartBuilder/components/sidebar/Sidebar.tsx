import { AsideSection } from "../../../../components/ui/AsideSection"
import { AccessibilityPanel } from "./AccessibilityPanel"
import { AestheticsPanel } from "./AestheticsPanel"
import { AnnotationsPanel } from "./AnnotationsPanel"
import { CaptionPanel } from "./CaptionPanel"
import { DataTablePanel } from "./DataTablePanel"
import { DataLabelsPanel } from "./DataLabelsPanel"
import { DataUpload } from "./DataUpload"
import { EncodingShelves } from "./EncodingShelves"
import { FieldList } from "./FieldList"
import { LabelsPanel } from "./LabelsPanel"
import { LegendPanel } from "./LegendPanel"
import { MapsSection } from "./MapsSection"
import { ReshapePanel } from "./ReshapePanel"
import { ThemePanel } from "./ThemePanel"
import { TooltipPanel } from "./TooltipPanel"

export const Sidebar = () => {
	return (
		// The aside is the ONLY scroll region in the sidebar, on BOTH axes —
		// panels never get inner scrollers. The inner wrapper carries the
		// stack rhythm plus a min-width floor, so the aside scrolls past it
		// instead of the rows squeezing.
		//
		// `min-w-95` (380px — SIDEBAR_CONTENT_FLOOR in lib/storage.ts, which
		// shows the arithmetic) is that floor: control rows are a fixed label
		// column (LABEL_COL's `w-24`) plus fixed-width controls, and the
		// widest canonical row — a per-value color row of hex box + swatch +
		// palette picker + its "reset" link, ~321px — needs 377px once the
		// section's `px-3`, the option panel's and the subsection card's 8px
		// are paid on both sides. Below it the trailing control slid out of
		// reach, which reads as the option not existing. The wide layout's
		// column can't go narrower than the floor + this aside's `px-2` +
		// slack (SIDEBAR_MIN_WIDTH; the resize handle collapses the column
		// instead) + the vertical scrollbar's gutter, which
		// `scrollbar-gutter: stable` reserves whether or not the menu
		// overflows, so it never scrolls sideways there. The tablet sheet is
		// SIDEBAR_MIN_WIDTH wide for the same reason.
		//
		// Below `sm` the floor is dropped: the narrow-layout sheet is
		// `100% - 1.5rem` wide, so on a 320px phone it is 296px and the floor
		// would make the whole menu scroll sideways. The rows shrink there,
		// starting with the color row's hex box (ColorInput).
		<aside className="bg-vc-sidebar h-full overflow-auto px-2 py-3 [scrollbar-gutter:stable] lg:py-5">
			<div className="flex min-w-0 flex-col gap-1 sm:min-w-95 lg:gap-3">
				<AsideSection title="Data">
					<DataUpload />
					<ReshapePanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Fields">
					<FieldList />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Encodings">
					<EncodingShelves />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Maps" defaultCollapsed>
					<MapsSection />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Data Labels" defaultCollapsed>
					<DataLabelsPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Legend" defaultCollapsed>
					<LegendPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Titles">
					<LabelsPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Tooltips and hover">
					<TooltipPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Caption" defaultCollapsed>
					<CaptionPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Data table" defaultCollapsed>
					<DataTablePanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Annotations" defaultCollapsed>
					<AnnotationsPanel />
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Aesthetics & Theme">
					<div className="vc-option-panel">
						<ThemePanel />
						<AestheticsPanel />
					</div>
				</AsideSection>
				<hr className="mx-3 border-stone-200 dark:border-stone-700" />
				<AsideSection title="Accessibility">
					<AccessibilityPanel />
				</AsideSection>
			</div>
		</aside>
	)
}
