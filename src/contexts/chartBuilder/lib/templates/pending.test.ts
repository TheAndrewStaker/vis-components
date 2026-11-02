import { describe, expect, it } from "vitest"
import { EMPTY_CHANNEL_CONFIGS } from "../channelConfig"
import { SYSTEM_LIGHT_THEME } from "../systemThemes"
import { labelsFromTheme } from "../themeConfig"
import { emptyEncodings, type Visual } from "../types"
import { isTemplatePending } from "./pending"

const row = (id: string, over: Partial<Visual> = {}): Visual => ({
	id,
	name: id,
	folderId: null,
	datasetId: null,
	createdAtVersionId: null,
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
	thumbnail: null,
	createdAt: 1,
	updatedAt: 1,
	template: { sourceFields: [], formatMemory: {} },
	...over,
})

const visuals = [
	row("tpl"),
	row("trashed", { deletedAt: 5 }),
	row("plain", { template: undefined, datasetId: "ds" }),
]
const pending = { templateId: "tpl", visualId: null, datasetId: null }

describe("isTemplatePending", () => {
	it("is true for an unsaved, data-less draft from a live template", () => {
		expect(isTemplatePending(pending, visuals)).toBe(true)
	})

	it("is false without a template id", () => {
		expect(isTemplatePending({ ...pending, templateId: null }, visuals)).toBe(false)
	})

	it("is false once the draft is a saved visual", () => {
		expect(isTemplatePending({ ...pending, visualId: "v" }, visuals)).toBe(false)
	})

	it("is false once a data set is attached", () => {
		expect(isTemplatePending({ ...pending, datasetId: "ds" }, visuals)).toBe(false)
	})

	it("is false when the template row is missing", () => {
		expect(isTemplatePending({ ...pending, templateId: "gone" }, visuals)).toBe(false)
	})

	it("is false when the row is not a template", () => {
		expect(isTemplatePending({ ...pending, templateId: "plain" }, visuals)).toBe(false)
	})

	it("is false when the template is trashed", () => {
		expect(isTemplatePending({ ...pending, templateId: "trashed" }, visuals)).toBe(false)
	})
})
