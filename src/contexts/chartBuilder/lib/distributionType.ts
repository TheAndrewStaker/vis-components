/** The axis panel's Distribution picker: histogram, density curve,
 * violin and box plot are one choice, so picking one turns the others
 * off. */

import type { DistributionOverlayConfig, HistogramConfig } from "./channelConfig"

export type DistributionType = "none" | "histogram" | "density" | "violin" | "box"

export const distributionTypeOf = (
	histogram: Pick<HistogramConfig, "enabled">,
	overlay: Partial<DistributionOverlayConfig>
): DistributionType =>
	histogram.enabled
		? "histogram"
		: overlay.showDensityCurve
			? "density"
			: overlay.showDensityViolin
				? "violin"
				: overlay.showBoxPlot
					? "box"
					: "none"

export const distributionTypePatch = <H extends Pick<HistogramConfig, "enabled">, O extends object>(
	histogram: H,
	overlay: O,
	type: DistributionType
): { histogram: H; distributionOverlay: O & Pick<DistributionOverlayConfig, "showDensityCurve" | "showDensityViolin" | "showBoxPlot"> } => ({
	histogram: { ...histogram, enabled: type === "histogram" },
	distributionOverlay: {
		...overlay,
		showDensityCurve: type === "density",
		showDensityViolin: type === "violin",
		showBoxPlot: type === "box",
	},
})
