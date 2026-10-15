import type {
	ChannelConfigs,
	ModulationSlotConfig,
	ModulationSlotKey,
} from "./channelConfig"
import type { ChartMode } from "./chartMode"
import type { Encodings } from "./types"

/** The two color modulations that split by mark part. */
export type ModulationChannel = "saturation" | "brightness"

/** Where each channel keeps its per-part slots on `ChannelConfigs`. */
export const MODULATION_SLOTS_KEY = {
	saturation: "saturationSlots",
	brightness: "brightnessSlots",
} as const satisfies Record<ModulationChannel, keyof ChannelConfigs>

/** Static description of one saturation / brightness part. Mirrors
 * `OpacitySlotDef`, minus the default level: every part starts OFF (no
 * modulation), which is what the renderers drew before slots existed. */
export type ModulationSlotDef = {
	key: ModulationSlotKey
	label: string
	modes: ReadonlySet<ChartMode>
	isApplicable: (encodings: Encodings, configs: ChannelConfigs) => boolean
}

const m = (...modes: ChartMode[]): ReadonlySet<ChartMode> => new Set(modes)

/** Registry of every modulation slot, in display order. Fill is NOT here — it
 * reuses the overall `saturation` / `brightness` encoding. Only the scatter
 * renderer (points + connection lines) reads these parts today, so the gates
 * keep the menu from offering a control that would do nothing elsewhere. */
export const MODULATION_SLOT_REGISTRY: readonly ModulationSlotDef[] = [
	{
		key: "outline",
		label: "Outline",
		modes: m("scatter"),
		isApplicable: () => true,
	},
	{
		key: "line",
		label: "Line",
		modes: m("scatter"),
		isApplicable: (encodings) => !!encodings.connection?.field,
	},
]

/** This slot deviates from its untouched (off) state: a field mapped, or a
 * level set. Shared by the panel's subsection dot and the channel's encoding
 * row dot so the two can't drift. */
export const modulationSlotEdited = (
	slotCfg: ModulationSlotConfig | undefined
): boolean => !!slotCfg && (slotCfg.field != null || slotCfg.level != null)

/** Slots shown for a given chart mode + config. */
export const applicableModulationSlots = (
	mode: ChartMode,
	encodings: Encodings,
	configs: ChannelConfigs
): ModulationSlotDef[] =>
	MODULATION_SLOT_REGISTRY.filter(
		(d) => d.modes.has(mode) && d.isApplicable(encodings, configs)
	)
