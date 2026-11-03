// Zafiro task pane — SPIKE. Insert a published Zafiro picture on a slide,
// keep every inserted picture current, and turn pasted Zafiro links into
// pictures.
//
// Office.js strategy (verified against learn.microsoft.com, 2026-11-03):
//
//   INSERT  = slide.shapes.addGeometricShape(rectangle, {left,top,width,height})
//             + shape.fill.setImage(base64) + lineFormat.visible = false,
//             then shape.tags.add("ZAFIRO_EMBED_ID", id) and shape.name.
//   REFRESH = shape.fill.setImage(newBase64) on the SAME shape — a one-call
//             swap that keeps left/top/width/height, z-order, name and tags.
//             Only the height is touched, and only if the republished
//             picture's aspect ratio changed (a picture fill stretches).
//
//   Why a rectangle with a picture fill rather than a real picture shape:
//   ShapeCollection.addPicture(base64) exists but is PREVIEW ONLY
//   (https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapecollection
//   → "API set: PowerPointApi BETA (PREVIEW ONLY)"), so it can't be relied on.
//   ShapeFill.setImage(base64) is PowerPointApi 1.8 (Mac 16.96+, web, Win 2504+)
//   (https://learn.microsoft.com/en-us/javascript/api/powerpoint/powerpoint.shapefill).
//
//   FALLBACK (PowerPointApi < 1.8, >= 1.5): Office.context.document
//   .setSelectedDataAsync(base64, {coercionType: Image, imageLeft/Top/Width/
//   Height}) (ImageCoercion 1.1 — https://learn.microsoft.com/en-us/javascript/api/requirement-sets/common/image-coercion-requirement-sets,
//   options at https://learn.microsoft.com/en-us/javascript/api/office/office.setselecteddataoptions),
//   then context.presentation.getSelectedShapes() (PowerPointApi 1.5) to tag
//   the new picture. Refresh on this path = goToByIdAsync(slideId, Slide),
//   insert at the old geometry, delete the old shape (z-order NOT kept).
//   This path is written but UNTESTED — the dev machine has 1.10.
//
//   Other sets used: tags add/getItemOrNullObject/delete 1.3; shape
//   left/top/width/height/name/type/lineFormat/textFrame 1.4; delete() 1.3;
//   getSelectedSlides/getSelectedShapes 1.5; Office.addin.setStartupBehavior
//   SharedRuntime 1.1 (https://learn.microsoft.com/en-us/javascript/api/office/office.addin).
//   Requirement-set table: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/powerpoint/powerpoint-api-requirement-sets
/* global Office, PowerPoint, Zafiro */
;(function () {
	"use strict"

	const $ = (id) => document.getElementById(id)
	const els = {
		env: $("env"),
		link: $("link"),
		insert: $("insert"),
		insertStatus: $("insert-status"),
		refresh: $("refresh"),
		refreshStatus: $("refresh-status"),
		autoRefresh: $("auto-refresh"),
		autoConvert: $("auto-convert"),
		convertStatus: $("convert-status"),
		log: $("log"),
	}

	const PREFS = { autoRefresh: "zafiro.autoRefresh", autoConvert: "zafiro.autoConvert" }
	const REFRESH_EVERY_MS = 30_000
	const CONVERT_POLL_MS = 2_000
	// The published picture carries its dpi in a pHYs chunk (96 × the raster
	// scale Zafiro captured at — 2 for a crisp projected picture). Placing it
	// at px * 72/dpi pt makes text the same point size on the slide as in the
	// app. An unstamped PNG is taken as 96 dpi (1 CSS px per px). The slide
	// size isn't exposed by the API sets we target; 960×540 pt is PowerPoint's
	// 16:9 default.
	const CSS_DPI = 96
	const ptPerPx = (img) => 72 / (img.dpi || CSS_DPI)
	const SLIDE_WIDTH_PT = 960
	const SLIDE_HEIGHT_PT = 540
	const SLIDE_MARGIN_PT = 24
	// Shape types that own a text frame; reading textFrame on an Image throws.
	const TEXT_TYPES = new Set(["TextBox", "GeometricShape", "Placeholder"])

	const api = { fillImage: false, selectedShapes: false, shared: false }

	// ---- UI helpers ---------------------------------------------------------

	const log = (message) => {
		const line = `${new Date().toLocaleTimeString()}  ${message}`
		els.log.textContent = `${line}\n${els.log.textContent}`.split("\n").slice(0, 60).join("\n")
	}

	const setStatus = (el, message, kind) => {
		el.textContent = message
		el.className = `status${kind ? ` ${kind}` : ""}`
	}

	const errorText = (error) => {
		if (!error) return "unknown error"
		const debug = error.debugInfo ? ` [${error.debugInfo.code || ""} ${error.debugInfo.errorLocation || ""}]` : ""
		return `${error.message || String(error)}${debug}`
	}

	const readPref = (key, fallback) => {
		try {
			const raw = localStorage.getItem(key)
			return raw === null ? fallback : raw === "1"
		} catch {
			return fallback
		}
	}
	const writePref = (key, value) => {
		try {
			localStorage.setItem(key, value ? "1" : "0")
		} catch {
			/* private mode etc. — the checkbox still works for this session */
		}
	}

	// ---- geometry -----------------------------------------------------------

	const aspect = (img) => (img.width && img.height ? img.height / img.width : 9 / 16)

	/** Natural size of the picture in points — ALWAYS 1:1, never shrunk to
	 *  fit, so point sizes match Zafiro. Centred on the slide; a figure larger
	 *  than the slide is pinned to the top-left margin instead and the status
	 *  line says so (size the canvas in Zafiro, Export → size, to fit). */
	const defaultGeometry = (img) => {
		const width = (img.width || 640) * ptPerPx(img)
		const height = (img.height || 360) * ptPerPx(img)
		const fits = fitsSlide({ width, height })
		return {
			left: fits ? (SLIDE_WIDTH_PT - width) / 2 : SLIDE_MARGIN_PT,
			top: fits ? (SLIDE_HEIGHT_PT - height) / 2 : SLIDE_MARGIN_PT,
			width,
			height,
		}
	}

	const fitsSlide = (g) =>
		g.width <= SLIDE_WIDTH_PT - 2 * SLIDE_MARGIN_PT && g.height <= SLIDE_HEIGHT_PT - 2 * SLIDE_MARGIN_PT

	const describeSize = (g) =>
		`${Math.round(g.width)}×${Math.round(g.height)} pt (${(g.width / 72).toFixed(1)}×${(g.height / 72).toFixed(1)} in)`

	const shapeName = (id) => `Zafiro ${id}`

	// ---- placing a picture (preferred path, PowerPointApi 1.8) ---------------

	/** Add a picture-filled rectangle to `slide` inside an open context. The
	 *  caller syncs. */
	const addPictureShape = (slide, id, img, geometry) => {
		const shape = slide.shapes.addGeometricShape(PowerPoint.GeometricShapeType.rectangle, geometry)
		shape.fill.setImage(img.base64)
		shape.lineFormat.visible = false
		shape.name = shapeName(id)
		shape.tags.add(Zafiro.TAG_KEY, id)
		return shape
	}

	// ---- placing a picture (fallback path, ImageCoercion + 1.5) -------------

	const setSelectedImage = (img, geometry) =>
		new Promise((resolve, reject) => {
			Office.context.document.setSelectedDataAsync(
				img.base64,
				{
					coercionType: Office.CoercionType.Image,
					imageLeft: geometry.left,
					imageTop: geometry.top,
					imageWidth: geometry.width,
					imageHeight: geometry.height,
				},
				(result) => {
					if (result.status === Office.AsyncResultStatus.Failed) reject(result.error)
					else resolve()
				},
			)
		})

	const goToSlide = (slideId) =>
		new Promise((resolve, reject) => {
			Office.context.document.goToByIdAsync(slideId, Office.GoToType.Slide, (result) => {
				if (result.status === Office.AsyncResultStatus.Failed) reject(result.error)
				else resolve()
			})
		})

	/** Fallback insert on the CURRENT slide: coerce the image in, then tag
	 *  whatever got selected (or, failing that, the slide's last shape). */
	const insertViaCoercion = async (id, img, geometry) => {
		await setSelectedImage(img, geometry)
		await PowerPoint.run(async (context) => {
			const selected = context.presentation.getSelectedShapes()
			const count = selected.getCount()
			await context.sync()
			let shape
			if (count.value > 0) {
				shape = selected.getItemAt(0)
			} else {
				const shapes = context.presentation.getSelectedSlides().getItemAt(0).shapes
				shapes.load("items/id")
				await context.sync()
				shape = shapes.items[shapes.items.length - 1]
			}
			shape.name = shapeName(id)
			shape.tags.add(Zafiro.TAG_KEY, id)
			await context.sync()
		})
	}

	// ---- Insert -------------------------------------------------------------

	const insertFromLink = async () => {
		const id = Zafiro.parseEmbedId(els.link.value)
		if (!id) {
			setStatus(els.insertStatus, "That doesn't look like a Zafiro link (no embed id in it).", "err")
			return
		}
		els.insert.disabled = true
		setStatus(els.insertStatus, `Fetching picture ${id}…`)
		try {
			const img = await Zafiro.fetchImage(id)
			const geometry = defaultGeometry(img)
			if (api.fillImage) {
				await PowerPoint.run(async (context) => {
					const slide = context.presentation.getSelectedSlides().getItemAt(0)
					addPictureShape(slide, id, img, geometry)
					await context.sync()
				})
			} else {
				await insertViaCoercion(id, img, geometry)
			}
			setStatus(
				els.insertStatus,
				`Inserted at 100%: ${describeSize(geometry)}.` +
					(fitsSlide(geometry)
						? ""
						: " That is larger than a 16:9 slide. To shrink it on the slide, drag a corner handle (text shrinks with it). To keep text at its Zafiro size, give the visual a smaller canvas in Zafiro — Aesthetics → Canvas size — and Republish."),
				"ok",
			)
			log(`insert ${id} ok`)
			els.link.value = ""
		} catch (error) {
			setStatus(els.insertStatus, `Insert failed: ${errorText(error)}`, "err")
			log(`insert ${id} FAILED: ${errorText(error)}`)
		} finally {
			els.insert.disabled = false
		}
	}

	// ---- Refresh ------------------------------------------------------------

	/** Every tagged figure in the deck: { slideId, shapeId, id, geometry }. */
	const collectFigures = () =>
		PowerPoint.run(async (context) => {
			const slides = context.presentation.slides
			slides.load("items/id")
			await context.sync()
			const figures = []
			for (const slide of slides.items) {
				const shapes = slide.shapes
				shapes.load("items/id,items/left,items/top,items/width,items/height")
				await context.sync()
				const tags = shapes.items.map((shape) => shape.tags.getItemOrNullObject(Zafiro.TAG_KEY))
				tags.forEach((tag) => tag.load("value"))
				await context.sync()
				shapes.items.forEach((shape, i) => {
					const tag = tags[i]
					if (tag.isNullObject) return
					const id = Zafiro.parseEmbedId(tag.value)
					if (!id) return
					figures.push({
						slideId: slide.id,
						shapeId: shape.id,
						id,
						geometry: { left: shape.left, top: shape.top, width: shape.width, height: shape.height },
					})
				})
			}
			return figures
		})

	const refreshOne = async (figure, img) => {
		const { geometry } = figure
		const wantHeight = geometry.width * aspect(img)
		const aspectChanged = Math.abs(wantHeight - geometry.height) / Math.max(geometry.height, 1) > 0.01
		if (api.fillImage) {
			await PowerPoint.run(async (context) => {
				const shape = context.presentation.slides.getItem(figure.slideId).shapes.getItem(figure.shapeId)
				shape.fill.setImage(img.base64)
				if (aspectChanged) shape.height = wantHeight
				await context.sync()
			})
			return
		}
		// Fallback: re-insert at the old geometry on that slide, then drop the old one.
		await goToSlide(figure.slideId)
		await insertViaCoercion(figure.id, img, {
			...geometry,
			height: aspectChanged ? wantHeight : geometry.height,
		})
		await PowerPoint.run(async (context) => {
			context.presentation.slides.getItem(figure.slideId).shapes.getItem(figure.shapeId).delete()
			await context.sync()
		})
	}

	let refreshing = false
	const refreshAll = async (trigger) => {
		if (refreshing) return
		refreshing = true
		els.refresh.disabled = true
		setStatus(els.refreshStatus, "Looking for figures…")
		try {
			const figures = await collectFigures()
			if (figures.length === 0) {
				setStatus(els.refreshStatus, "No Zafiro figures in this deck.")
				return
			}
			const ids = [...new Set(figures.map((f) => f.id))]
			setStatus(els.refreshStatus, `Fetching ${ids.length} picture${ids.length === 1 ? "" : "s"}…`)
			const images = new Map()
			const failures = []
			for (const id of ids) {
				try {
					images.set(id, await Zafiro.fetchImage(id))
				} catch (error) {
					failures.push(`${id}: ${errorText(error)}`)
				}
			}
			let done = 0
			for (const figure of figures) {
				const img = images.get(figure.id)
				if (!img) continue
				try {
					await refreshOne(figure, img)
					done += 1
				} catch (error) {
					failures.push(`${figure.id} on slide ${figure.slideId}: ${errorText(error)}`)
				}
			}
			const summary = `Refreshed ${done} figure${done === 1 ? "" : "s"}`
			if (failures.length > 0) {
				setStatus(els.refreshStatus, `${summary}; ${failures.length} failed:\n${failures.join("\n")}`, "err")
			} else {
				setStatus(els.refreshStatus, `${summary} (${new Date().toLocaleTimeString()}).`, "ok")
			}
			log(`refresh (${trigger}): ${done}/${figures.length} ok`)
		} catch (error) {
			setStatus(els.refreshStatus, `Refresh failed: ${errorText(error)}`, "err")
			log(`refresh (${trigger}) FAILED: ${errorText(error)}`)
		} finally {
			refreshing = false
			els.refresh.disabled = false
		}
	}

	let refreshTimer = null
	const setAutoRefresh = (on) => {
		writePref(PREFS.autoRefresh, on)
		if (refreshTimer) clearInterval(refreshTimer)
		refreshTimer = on ? setInterval(() => refreshAll("auto"), REFRESH_EVERY_MS) : null
		log(`auto-refresh ${on ? "on" : "off"}`)
	}

	// ---- Auto-convert pasted links -----------------------------------------

	/** The trimmed text must be ONLY a Zafiro link: one token, no other words,
	 *  and either a URL carrying an embed id or the bare id. */
	const linkOnly = (text) => {
		const trimmed = (text || "").trim()
		if (!trimmed || /\s/.test(trimmed)) return null
		const id = Zafiro.parseEmbedId(trimmed)
		if (!id) return null
		if (!/^https?:\/\//i.test(trimmed) && trimmed.toLowerCase() !== id) return null
		return id
	}

	/** Text shapes on the current slide whose whole text is a Zafiro link. */
	const findLinkShapes = () =>
		PowerPoint.run(async (context) => {
			const slide = context.presentation.getSelectedSlides().getItemAt(0)
			slide.load("id")
			const shapes = slide.shapes
			shapes.load("items/id,items/type,items/left,items/top,items/width,items/height")
			await context.sync()
			const textual = shapes.items.filter((shape) => TEXT_TYPES.has(shape.type))
			const frames = textual.map((shape) => shape.textFrame.load("hasText,textRange/text"))
			await context.sync()
			const found = []
			textual.forEach((shape, i) => {
				const frame = frames[i]
				if (!frame.hasText) return
				const id = linkOnly(frame.textRange.text)
				if (!id) return
				found.push({
					slideId: slide.id,
					shapeId: shape.id,
					id,
					geometry: { left: shape.left, top: shape.top, width: shape.width, height: shape.height },
				})
			})
			return found
		})

	let converting = false
	const convertLinksOnCurrentSlide = async () => {
		if (converting || !els.autoConvert.checked) return
		converting = true
		try {
			const candidates = await findLinkShapes()
			for (const candidate of candidates) {
				const { id, geometry } = candidate
				try {
					const img = await Zafiro.fetchImage(id)
					const placed = { left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.width * aspect(img) }
					if (api.fillImage) {
						await PowerPoint.run(async (context) => {
							const slide = context.presentation.slides.getItem(candidate.slideId)
							addPictureShape(slide, id, img, placed)
							slide.shapes.getItem(candidate.shapeId).delete()
							await context.sync()
						})
					} else {
						await insertViaCoercion(id, img, placed)
						await PowerPoint.run(async (context) => {
							context.presentation.slides.getItem(candidate.slideId).shapes.getItem(candidate.shapeId).delete()
							await context.sync()
						})
					}
					setStatus(els.convertStatus, `Converted a pasted link into ${shapeName(id)}.`, "ok")
					log(`convert ${id} ok`)
				} catch (error) {
					setStatus(els.convertStatus, `Couldn't convert ${id}: ${errorText(error)}`, "err")
					log(`convert ${id} FAILED: ${errorText(error)}`)
				}
			}
		} catch (error) {
			// No slide selected (e.g. slide sorter) or a text frame we misjudged:
			// not worth a red status every 2 s, just a log line.
			log(`convert scan skipped: ${errorText(error)}`)
		} finally {
			converting = false
		}
	}

	let convertTimer = null
	let convertDebounce = null
	const onSelectionChanged = () => {
		clearTimeout(convertDebounce)
		convertDebounce = setTimeout(convertLinksOnCurrentSlide, 300)
	}
	const setAutoConvert = (on) => {
		writePref(PREFS.autoConvert, on)
		if (convertTimer) clearInterval(convertTimer)
		convertTimer = on ? setInterval(convertLinksOnCurrentSlide, CONVERT_POLL_MS) : null
		const doc = Office.context.document
		if (on) {
			doc.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSelectionChanged, (result) => {
				if (result.status === Office.AsyncResultStatus.Failed) log(`selection handler: ${errorText(result.error)}`)
			})
			convertLinksOnCurrentSlide()
		} else {
			doc.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: onSelectionChanged }, () => {})
		}
		setStatus(els.convertStatus, on ? "Watching the current slide for pasted links." : "")
		log(`auto-convert ${on ? "on" : "off"}`)
	}

	// ---- boot ---------------------------------------------------------------

	Office.onReady((info) => {
		if (info.host !== Office.HostType.PowerPoint) {
			els.env.textContent = `This add-in is for PowerPoint (host: ${info.host || "none"}).`
			return
		}
		const req = Office.context.requirements
		api.fillImage = req.isSetSupported("PowerPointApi", "1.8")
		api.selectedShapes = req.isSetSupported("PowerPointApi", "1.5")
		api.shared = req.isSetSupported("SharedRuntime", "1.1")
		if (!api.fillImage && !api.selectedShapes) {
			els.env.textContent = "This PowerPoint is too old (needs PowerPointApi 1.5; 1.8 preferred)."
			return
		}
		els.env.textContent =
			`PowerPoint on ${info.platform}. ` +
			(api.fillImage ? "Picture-fill refresh (PowerPointApi 1.8)." : "Fallback: re-insert refresh (PowerPointApi 1.5).") +
			(api.shared ? " Shared runtime." : " No shared runtime: watchers stop when the pane closes.")

		els.insert.disabled = false
		els.refresh.disabled = false
		els.insert.addEventListener("click", insertFromLink)
		els.link.addEventListener("keydown", (event) => {
			if (event.key === "Enter") insertFromLink()
		})
		els.refresh.addEventListener("click", () => refreshAll("manual"))
		els.autoRefresh.addEventListener("change", () => setAutoRefresh(els.autoRefresh.checked))
		els.autoConvert.addEventListener("change", () => setAutoConvert(els.autoConvert.checked))

		els.autoRefresh.checked = readPref(PREFS.autoRefresh, false)
		if (els.autoRefresh.checked) setAutoRefresh(true)
		els.autoConvert.checked = readPref(PREFS.autoConvert, true)
		if (els.autoConvert.checked) setAutoConvert(true)

		// Keep the shared runtime loading with the document so the watchers run
		// even before the pane is opened (SharedRuntime 1.1; feature-detected).
		if (api.shared && Office.addin && typeof Office.addin.setStartupBehavior === "function") {
			Office.addin
				.setStartupBehavior(Office.StartupBehavior.load)
				.then(() => log("startup behavior: load with document"))
				.catch((error) => log(`startup behavior not set: ${errorText(error)}`))
		}
	})
})()
