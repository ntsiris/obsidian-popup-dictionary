import { Notice, Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	PopupDictionarySettingTab,
	type PopupDictionarySettings,
} from "./settings";
import { DictionaryClient } from "./dictionary";
import { DefinitionPopup, type Anchor } from "./popup";
import { getSelectedWord } from "./wordDetection";

const SELECTION_DEBOUNCE_MS = 250;

export default class PopupDictionaryPlugin extends Plugin {
	settings: PopupDictionarySettings;

	private dict: DictionaryClient;
	private popup: DefinitionPopup;
	private selectionTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.dict = new DictionaryClient(() => this.settings.wiktionaryEdition);
		this.popup = new DefinitionPopup(() => this.settings);

		this.addSettingTab(new PopupDictionarySettingTab(this.app, this));

		this.addCommand({
			id: "lookup-selection",
			name: "Look up selected word",
			callback: () => this.lookupSelection(true),
		});

		// Automatic lookup when a word is selected (if enabled).
		this.registerDomEvent(document, "selectionchange", () => {
			if (this.settings.triggerOnSelection !== "auto") return;
			this.debouncedSelection();
		});

		// Dismissers.
		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Escape" && this.popup.isVisible()) {
				this.popup.hide();
			}
		});
		this.registerDomEvent(
			document,
			"mousedown",
			(evt: MouseEvent) => {
				if (
					this.popup.isVisible() &&
					!this.popup.contains(evt.target as Node)
				) {
					this.popup.hide();
				}
			},
			true
		);
	}

	onunload(): void {
		if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
		this.popup?.hide();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private debouncedSelection(): void {
		if (this.selectionTimer !== null) window.clearTimeout(this.selectionTimer);
		this.selectionTimer = window.setTimeout(() => {
			this.selectionTimer = null;
			this.lookupSelection(false);
		}, SELECTION_DEBOUNCE_MS);
	}

	private lookupSelection(notifyIfEmpty: boolean): void {
		const hit = getSelectedWord(window);
		if (!hit) {
			if (notifyIfEmpty) {
				new Notice("Popup Dictionary: select a word first.");
			}
			return;
		}
		void this.run(hit.word, hit.rect);
	}

	private async run(word: string, anchor: Anchor): Promise<void> {
		this.popup.showLoading(anchor, word);
		try {
			const result = await this.dict.lookup(word);
			if (this.popup.word !== word) return; // superseded or dismissed
			if (!result) {
				this.popup.showNotFound(anchor, word);
			} else {
				this.popup.showResult(anchor, result);
			}
		} catch (e) {
			if (this.popup.word !== word) return;
			this.popup.showError(anchor, word, errorMessage(e));
		}
	}
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : "Lookup failed.";
}
