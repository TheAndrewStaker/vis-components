/** The Aesthetics panel's canvas-size and aspect-ratio toggles. */

import type { AspectRatioConfig, CanvasSizeConfig } from "./channelConfig"
import type { Theme } from "./types"

export const MIN_CANVAS_DIM = 50
export const DEFAULT_CANVAS_WIDTH = 1000
export const DEFAULT_CANVAS_HEIGHT = 600

/** The theme's starting canvas size (Settings → Themes → Exporting →
 *  Canvas size). Either side may be unset. */
export type CanvasSizeThemeDefaults = Pick<
	Theme,
	"exportCanvasWidth" | "exportCanvasHeight"
>

/** The size a canvas starts at — and the sidebar's reset target: the
 *  theme's Canvas size, else 1000 × 600. */
export const canvasStartSize = (
	theme: CanvasSizeThemeDefaults | null | undefined
): { width: number; height: number } => ({
	width: theme?.exportCanvasWidth ?? DEFAULT_CANVAS_WIDTH,
	height: theme?.exportCanvasHeight ?? DEFAULT_CANVAS_HEIGHT,
})

/** "Set canvas size": a size the visual never had starts at the theme's
 *  Canvas size (else 1000 × 600). A size it had is kept — the theme is
 *  consulted only for a missing side, and never re-applied. */
export const canvasSizeToggled = (
	prev: Partial<CanvasSizeConfig> | null | undefined,
	enabled: boolean,
	theme: CanvasSizeThemeDefaults | null | undefined
): CanvasSizeConfig => {
	const start = canvasStartSize(theme)
	return {
		...prev,
		enabled,
		width: prev?.width ?? start.width,
		height: prev?.height ?? start.height,
		unit: prev?.unit,
	}
}

/** "Fix aspect ratio": a ratio the visual never had starts at 1:1. */
export const aspectRatioToggled = (
	prev: Partial<AspectRatioConfig> | null | undefined,
	enabled: boolean
): AspectRatioConfig => ({
	...prev,
	enabled,
	length: prev?.length ?? 1,
	width: prev?.width ?? 1,
})
