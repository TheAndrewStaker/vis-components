import { describe, expect, it } from "vitest"
import { EMPTY_CHANNEL_CONFIGS } from "../channelConfig"
import { SYSTEM_LIGHT_THEME } from "../systemThemes"
import { labelsFromTheme } from "../themeConfig"
import { emptyEncodings, type Visual } from "../types"
import { buildTemplateBody } from "./buildTemplateBody"
import { mergeTemplateUpdate } from "./mergeTemplateUpdate"

const template: Visual = {
	id: "tpl",
	name: "My template",
	folderId: "folder-1",
	datasetId: null,
	createdAtVersionId: null,
	fieldTypeOverrides: {},
	encodings: emptyEncodings(),
	channelConfigs: EMPTY_CHANNEL_CONFIGS,
	labelsConfig: labelsFromTheme(SYSTEM_LIGHT_THEME),
	thumbnail: "old-thumb",
	thumbnailAt: 10,
	createdAt: 1,
	updatedAt: 10,
	updatedBy: { id: "prev", name: "Prev" } as Visual["updatedBy"],
	template: {
		sourceFields: [{ name: "Old", type: "temporal", kind: "date" }],
		formatMemory: {
			"axis:x": { date: "%Y", number: ",.0f" },
			"axis:y": { dollar: "$" },
		},
	},
}

const source: Visual = {
	...template,
	id: "v2",
	name: "Some visual",
	folderId: "folder-2",
	datasetId: "ds",
	createdAt: 500,
	themeId: "new-theme",
	template: undefined,
}

const next = {
	body: buildTemplateBody(source),
	meta: {
		sourceFields: [{ name: "New", type: "quantitative" as const, kind: "percent" as const }],
		formatMemory: {
			"axis:x": { date: "%b %Y", percent: ".0%" },
			"legend:hue": { number: ".1f" },
		},
	},
	thumbnail: "new-thumb",
}

describe("mergeTemplateUpdate", () => {
	const out = mergeTemplateUpdate(template, next, 99)

	it("keeps identity and library placement", () => {
		expect(out.id).toBe("tpl")
		expect(out.name).toBe("My template")
		expect(out.folderId).toBe("folder-1")
		expect(out.createdAt).toBe(1)
	})

	it("replaces the body, source fields and thumbnail", () => {
		expect(out.themeId).toBe("new-theme")
		expect(out.datasetId).toBeNull()
		expect(out.template?.sourceFields).toEqual(next.meta.sourceFields)
		expect(out.thumbnail).toBe("new-thumb")
		expect(out.thumbnailAt).toBe(99)
		expect(out.updatedAt).toBe(99)
	})

	it("merges format memory: same key + kind overwrites, new kinds and keys added, others kept", () => {
		expect(out.template?.formatMemory).toEqual({
			"axis:x": { date: "%b %Y", number: ",.0f", percent: ".0%" },
			"axis:y": { dollar: "$" },
			"legend:hue": { number: ".1f" },
		})
	})

	it("stamps the saver when known, else keeps the previous one", () => {
		expect(out.updatedBy).toEqual(template.updatedBy)
		const user = { id: "me", name: "Me" } as NonNullable<Visual["updatedBy"]>
		expect(mergeTemplateUpdate(template, next, 99, user).updatedBy).toEqual(user)
	})

	it("starts memory fresh on a row without template metadata", () => {
		const bare = { ...template, template: undefined }
		expect(mergeTemplateUpdate(bare, next, 99).template?.formatMemory).toEqual(
			next.meta.formatMemory,
		)
	})
})
