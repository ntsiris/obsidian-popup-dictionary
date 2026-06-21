import { sanitizeHTMLToDom } from "obsidian";
import type { DictionaryResult } from "./dictionary";
import type { PopupDictionarySettings } from "./settings";

// A single floating popup that renders dictionary results. Positioned with
// `position: fixed`, so anchor coordinates are viewport coordinates.

export type Anchor = DOMRect | { x: number; y: number };

interface SimpleRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const GAP = 6;
const MAX_W = 420;
const MAX_H = 360;
const MAX_EXAMPLES = 3;

export class DefinitionPopup {
	private el: HTMLElement | null = null;
	private pinned = false;
	private currentWord: string | null = null;
	private onEnter?: () => void;
	private onLeave?: () => void;

	constructor(private getSettings: () => PopupDictionarySettings) {}

	get word(): string | null {
		return this.currentWord;
	}

	isVisible(): boolean {
		return this.el !== null;
	}

	isPinned(): boolean {
		return this.pinned;
	}

	contains(node: Node | null): boolean {
		return !!node && !!this.el && this.el.contains(node);
	}

	/** Hook hover enter/leave so the host can keep the popup alive while pointed at. */
	setHoverHandlers(onEnter: () => void, onLeave: () => void): void {
		this.onEnter = onEnter;
		this.onLeave = onLeave;
	}

	showLoading(anchor: Anchor, word: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({ cls: "popup-dictionary-status", text: "Looking up…" });
		this.position(anchor);
	}

	showNotFound(anchor: Anchor, word: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({
			cls: "popup-dictionary-status",
			text: "No definition found.",
		});
		this.position(anchor);
	}

	showError(anchor: Anchor, word: string, message: string): void {
		this.currentWord = word;
		const el = this.reset();
		this.renderHeaderWord(el, word);
		el.createDiv({
			cls: "popup-dictionary-status mod-error",
			text: message,
		});
		this.position(anchor);
	}

	showResult(anchor: Anchor, result: DictionaryResult): void {
		this.currentWord = result.word;
		const settings = this.getSettings();
		const el = this.reset();

		const header = el.createDiv({ cls: "popup-dictionary-header" });
		header.createSpan({ cls: "popup-dictionary-word", text: result.word });
		header.createSpan({
			cls: "popup-dictionary-edition",
			text: result.edition,
		});
		const link = header.createEl("a", {
			cls: "popup-dictionary-source",
			text: "Wiktionary ↗",
			href: result.url,
		});
		link.setAttr("target", "_blank");
		link.setAttr("rel", "noopener");

		const body = el.createDiv({ cls: "popup-dictionary-body" });

		const filter = parseFilter(settings.filterLanguages);
		const filtered = filter
			? result.langs.filter((l) => filter.has(l.code.toLowerCase()))
			: result.langs;
		const sections = filtered.length > 0 ? filtered : result.langs;

		for (const lang of sections) {
			const sec = body.createDiv({ cls: "popup-dictionary-lang" });
			sec.createDiv({
				cls: "popup-dictionary-lang-name",
				text: lang.name,
			});

			for (const entry of lang.entries) {
				if (entry.partOfSpeech) {
					sec.createDiv({
						cls: "popup-dictionary-pos",
						text: entry.partOfSpeech,
					});
				}
				const ol = sec.createEl("ol", { cls: "popup-dictionary-defs" });
				const defs = entry.definitions.slice(
					0,
					Math.max(1, settings.maxDefinitionsPerEntry)
				);
				for (const def of defs) {
					const li = ol.createEl("li");
					li.appendChild(sanitizeHTMLToDom(def.html));
					if (settings.showExamples && def.examples.length > 0) {
						const exWrap = li.createDiv({
							cls: "popup-dictionary-examples",
						});
						for (const ex of def.examples.slice(0, MAX_EXAMPLES)) {
							exWrap
								.createDiv({ cls: "popup-dictionary-example" })
								.appendChild(sanitizeHTMLToDom(ex));
						}
					}
				}
			}
		}

		this.absolutizeLinks(body, result.edition);
		this.position(anchor);
	}

	hide(): void {
		if (this.el) {
			this.el.remove();
			this.el = null;
		}
		this.pinned = false;
		this.currentWord = null;
	}

	private renderHeaderWord(el: HTMLElement, word: string): void {
		const header = el.createDiv({ cls: "popup-dictionary-header" });
		header.createSpan({ cls: "popup-dictionary-word", text: word });
	}

	private ensureEl(): HTMLElement {
		if (this.el) return this.el;
		const el = document.body.createDiv({ cls: "popup-dictionary" });
		el.addEventListener("mousedown", () => {
			this.pinned = true;
		});
		el.addEventListener("mouseenter", () => this.onEnter?.());
		el.addEventListener("mouseleave", () => this.onLeave?.());
		this.el = el;
		return el;
	}

	private reset(): HTMLElement {
		const el = this.ensureEl();
		el.empty();
		this.pinned = false;
		return el;
	}

	// Wiktionary definitions use root-relative links ("/wiki/...") and "./word"
	// links. Rewrite them to absolute URLs that open in the system browser.
	private absolutizeLinks(root: HTMLElement, edition: string): void {
		const base = `https://${edition}.wiktionary.org`;
		root.findAll("a").forEach((a) => {
			const href = a.getAttribute("href") || "";
			if (href.startsWith("./")) {
				a.setAttribute("href", `${base}/wiki/${href.slice(2)}`);
			} else if (href.startsWith("/")) {
				a.setAttribute("href", `${base}${href}`);
			}
			a.setAttribute("target", "_blank");
			a.setAttribute("rel", "noopener");
		});
	}

	private position(anchor: Anchor): void {
		const el = this.el;
		if (!el) return;

		const rect = toRect(anchor);
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(el.offsetWidth, MAX_W);
		const h = Math.min(el.offsetHeight, MAX_H);

		let left = rect.left;
		let top = rect.bottom + GAP;

		if (left + w > vw - GAP) left = vw - w - GAP;
		if (left < GAP) left = GAP;

		if (top + h > vh - GAP) {
			// Not enough room below: flip above the anchor.
			const above = rect.top - GAP - h;
			top = above >= GAP ? above : Math.max(GAP, vh - h - GAP);
		}

		el.style.left = `${Math.round(left)}px`;
		el.style.top = `${Math.round(top)}px`;
	}
}

function toRect(anchor: Anchor): SimpleRect {
	if ("bottom" in anchor) {
		const r = anchor as DOMRect;
		return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
	}
	const p = anchor as { x: number; y: number };
	return { left: p.x, top: p.y, right: p.x, bottom: p.y };
}

function parseFilter(value: string): Set<string> | null {
	const codes = value
		.split(/[,\s]+/)
		.map((c) => c.trim().toLowerCase())
		.filter(Boolean);
	return codes.length > 0 ? new Set(codes) : null;
}
