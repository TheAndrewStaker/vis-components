/*
 * Zafiro live figure — PowerPoint CONTENT add-in (SPIKE).
 *
 * Each inserted instance remembers its own embed id in the add-in's
 * document settings (Office.context.document.settings), which Office
 * stores per add-in instance inside the .pptx. The figure itself is the
 * published embed page in an iframe.
 *
 * Vanilla JS, no build step. Loaded after office.js and zafiro.js.
 */
(function () {
	"use strict";

	var SETTING_KEY = "zafiroEmbedId";
	// Spike substitute for a push signal: poll by reloading the iframe so a
	// Republish in Zafiro shows up on the slide without user action.
	var AUTO_RELOAD_MS = 60 * 1000;
	// If office.js never reports ready (plain browser, blocked CDN), fall
	// back to browser-only mode so the page can still be eyeballed.
	var OFFICE_READY_TIMEOUT_MS = 3000;

	var els = {};
	var embedId = null;
	var reloadTimer = null;
	var settingsAvailable = false;

	/* ---------- Zafiro helpers (contract from zafiro.js) ---------- */

	var UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

	// zafiro.js is owned by the task-pane add-in; if it is missing (not
	// built yet, failed to load) this minimal stand-in keeps the page usable.
	var fallbackZafiro = {
		parseEmbedId: function (text) {
			var m = String(text || "").match(UUID_RE);
			return m ? m[0].toLowerCase() : null;
		},
		embedUrl: function (id) {
			return window.location.origin + "/embeds/" + id + "/index.html";
		},
	};

	function zafiro() {
		var z = window.Zafiro;
		if (z && typeof z.parseEmbedId === "function" && typeof z.embedUrl === "function") {
			return z;
		}
		return fallbackZafiro;
	}

	/* ---------- settings (feature-detected) ---------- */

	function settings() {
		try {
			var O = window.Office;
			if (O && O.context && O.context.document && O.context.document.settings) {
				return O.context.document.settings;
			}
		} catch (_e) {
			/* Office not initialised */
		}
		return null;
	}

	function readSavedId() {
		var s = settings();
		if (!s) return null;
		try {
			var raw = s.get(SETTING_KEY);
			return typeof raw === "string" && UUID_RE.test(raw) ? raw : null;
		} catch (_e) {
			return null;
		}
	}

	// Resolves with null on success, or an error message string.
	function writeSavedId(id, done) {
		var s = settings();
		if (!s) {
			// Browser-only preview: nothing to persist, carry on.
			done(null);
			return;
		}
		try {
			if (id) s.set(SETTING_KEY, id);
			else s.remove(SETTING_KEY);
			s.saveAsync(function (result) {
				var O = window.Office;
				var failed = O && O.AsyncResultStatus
					? result.status === O.AsyncResultStatus.Failed
					: result.status === "failed";
				if (failed) {
					var msg = result.error && result.error.message ? result.error.message : "unknown error";
					done("Couldn't save to the presentation (" + msg + "). The figure will show for now but won't be remembered.");
				} else {
					done(null);
				}
			});
		} catch (e) {
			done("Couldn't save to the presentation (" + (e && e.message ? e.message : String(e)) + ").");
		}
	}

	/* ---------- view switching ---------- */

	function show(el) { el.hidden = false; }
	function hide(el) { el.hidden = true; }

	function setError(el, message) {
		if (message) {
			el.textContent = message;
			show(el);
		} else {
			el.textContent = "";
			hide(el);
		}
	}

	function showForm(prefill) {
		stopAutoReload();
		hide(els.figure);
		els.frame.removeAttribute("src");
		setError(els.figureError, null);
		setError(els.setupError, null);
		els.link.value = prefill || "";
		els.show.disabled = false;
		show(els.setup);
		try { els.link.focus(); } catch (_e) { /* not focusable yet */ }
	}

	function frameSrc(id) {
		// Cache-bust so a reload actually refetches the republished page.
		return zafiro().embedUrl(id) + "?r=" + Date.now();
	}

	function loadFrame() {
		if (!embedId) return;
		els.frame.src = frameSrc(embedId);
	}

	function showFigure(id) {
		embedId = id;
		hide(els.setup);
		show(els.figure);
		loadFrame();
		startAutoReload();
	}

	function startAutoReload() {
		stopAutoReload();
		reloadTimer = window.setInterval(loadFrame, AUTO_RELOAD_MS);
	}

	function stopAutoReload() {
		if (reloadTimer !== null) {
			window.clearInterval(reloadTimer);
			reloadTimer = null;
		}
	}

	/* ---------- handlers ---------- */

	function onSubmit(event) {
		event.preventDefault();
		setError(els.setupError, null);
		var text = els.link.value.trim();
		if (!text) {
			setError(els.setupError, "Paste a Zafiro embed or image link first.");
			return;
		}
		var id = zafiro().parseEmbedId(text);
		if (!id) {
			setError(els.setupError, "That doesn't look like a Zafiro link. Copy the embed or image URL from Zafiro's Publish panel and try again.");
			return;
		}
		els.show.disabled = true;
		writeSavedId(id, function (saveError) {
			els.show.disabled = false;
			showFigure(id);
			// Saving failed but the figure is still useful this session.
			setError(els.figureError, saveError);
		});
	}

	function onReload() {
		setError(els.figureError, null);
		loadFrame();
		startAutoReload(); // restart the clock from the manual reload
	}

	function onChange() {
		var previous = embedId;
		embedId = null;
		writeSavedId(null, function (saveError) {
			showForm(previous ? zafiro().embedUrl(previous) : "");
			setError(els.setupError, saveError);
		});
	}

	function onFrameError() {
		setError(els.figureError, "The figure couldn't be loaded. Check that the Zafiro embed server is reachable, then reload.");
	}

	/* ---------- boot ---------- */

	function start() {
		els.setup = document.getElementById("setup");
		els.link = document.getElementById("link");
		els.show = document.getElementById("show");
		els.setupError = document.getElementById("setup-error");
		els.figure = document.getElementById("figure");
		els.frame = document.getElementById("frame");
		els.figureError = document.getElementById("figure-error");
		els.reload = document.getElementById("reload");
		els.change = document.getElementById("change");

		els.setup.addEventListener("submit", onSubmit);
		els.reload.addEventListener("click", onReload);
		els.change.addEventListener("click", onChange);
		els.frame.addEventListener("error", onFrameError);

		settingsAvailable = settings() !== null;
		var saved = readSavedId();
		if (saved) {
			showFigure(saved);
		} else {
			showForm("");
			if (!settingsAvailable) {
				// Plain-browser preview: say so quietly instead of pretending
				// the choice will persist.
				setError(els.setupError, "Preview mode: not running inside PowerPoint, so the link won't be remembered.");
			}
		}
	}

	var started = false;
	function startOnce() {
		if (started) return;
		started = true;
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", start);
		} else {
			start();
		}
	}

	var O = window.Office;
	if (O && typeof O.onReady === "function") {
		O.onReady(startOnce);
		// office.js in a plain browser resolves onReady with host null, but
		// if the CDN is blocked or the host handshake hangs, don't stay blank.
		window.setTimeout(startOnce, OFFICE_READY_TIMEOUT_MS);
	} else {
		startOnce();
	}
})();
