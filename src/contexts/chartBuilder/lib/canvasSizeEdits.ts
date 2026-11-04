/** The Aesthetics panel's canvas-size and aspect-ratio toggles. */

import type { AspectRatioConfig, CanvasSizeConfig } from "./channelConfig"

export const MIN_CANVAS_DIM = 50
export const DEFAULT_CANVAS_WIDTH = 1000
export const DEFAULT_CANVAS_HEIGHT = 600

/** "Set canvas size": a size the visual never had starts at 1000 × 600. */
export const canvasSizeToggled = (
	prev: Partial<CanvasSizeConfig> | null | undefined,
	enabled: boolean
): CanvasSizeConfig => ({
	...prev,
	enabled,
	width: prev?.width ?? DEFAULT_CANVAS_WIDTH,
	height: prev?.height ?? DEFAULT_CANVAS_HEIGHT,
	unit: prev?.unit,
})

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
