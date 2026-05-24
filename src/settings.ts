import { App, PluginSettingTab, Setting } from "obsidian";
import type PopupDictionaryPlugin from "./main";

export type SelectionTrigger = "command" | "auto";
export type HoverModifier = "ctrl" | "alt" | "shift" | "none";

export interface PopupDictionarySettings {
	/** Wiktionary edition to query; also the language the glosses are written in. */
	wiktionaryEdition: string;
	/** Comma-separated language codes to show; empty = show all. */
	filterLanguages: string;
	/** How a selected word is looked up. */
	triggerOnSelection: SelectionTrigger;
	hoverEnabled: boolean;
	hoverModifier: HoverModifier;
	hoverDelayMs: number;
	showExamples: boolean;
	maxDefinitionsPerEntry: number;
}

export const DEFAULT_SETTINGS: PopupDictionarySettings = {
	wiktionaryEdition: "en",
	filterLanguages: "",
	triggerOnSelection: "command",
	hoverEnabled: true,
	hoverModifier: "ctrl",
	hoverDelayMs: 300,
	showExamples: true,
	maxDefinitionsPerEntry: 5,
};

export class PopupDictionarySettingTab extends PluginSettingTab {
	private plugin: PopupDictionaryPlugin;

	constructor(app: App, plugin: PopupDictionaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Wiktionary edition")
			.setDesc(
				"Language edition of Wiktionary to query. This is also the language the " +
					'definitions are written in (e.g. "en" for English glosses, "fr" for ' +
					"French). Use a 2–3 letter language code."
			)
			.addText((t) =>
				t
					.setPlaceholder("en")
					.setValue(this.plugin.settings.wiktionaryEdition)
					.onChange(async (v) => {
						this.plugin.settings.wiktionaryEdition =
							v.trim().toLowerCase() || "en";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show only these languages")
			.setDesc(
				'Comma-separated language codes to display (e.g. "en, el, ja"). ' +
					"Leave empty to show every language Wiktionary returns for the word."
			)
			.addText((t) =>
				t
					.setPlaceholder("(all languages)")
					.setValue(this.plugin.settings.filterLanguages)
					.onChange(async (v) => {
						this.plugin.settings.filterLanguages = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Selection trigger")
			.setDesc(
				'How looking up a selected word works. "Command / hotkey" runs only when ' +
					'you invoke the command; "Automatic" pops up whenever you select a word.'
			)
			.addDropdown((d) =>
				d
					.addOption("command", "Command / hotkey")
					.addOption("auto", "Automatic on selection")
					.setValue(this.plugin.settings.triggerOnSelection)
					.onChange(async (v) => {
						this.plugin.settings.triggerOnSelection =
							v as SelectionTrigger;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable hover lookup")
			.setDesc("Show definitions when hovering a word (desktop only).")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.hoverEnabled)
					.onChange(async (v) => {
						this.plugin.settings.hoverEnabled = v;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.hoverEnabled) {
			new Setting(containerEl)
				.setName("Hover modifier key")
				.setDesc(
					"Hold this key while hovering to trigger a lookup. " +
						'"None" triggers on hover alone, which can be distracting.'
				)
				.addDropdown((d) =>
					d
						.addOption("ctrl", "Ctrl / Cmd")
						.addOption("alt", "Alt / Option")
						.addOption("shift", "Shift")
						.addOption("none", "None (hover only)")
						.setValue(this.plugin.settings.hoverModifier)
						.onChange(async (v) => {
							this.plugin.settings.hoverModifier =
								v as HoverModifier;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Hover delay")
				.setDesc(
					"How long (ms) the pointer must rest on a word before the lookup fires."
				)
				.addSlider((s) =>
					s
						.setLimits(0, 1000, 50)
						.setValue(this.plugin.settings.hoverDelayMs)
						.setDynamicTooltip()
						.onChange(async (v) => {
							this.plugin.settings.hoverDelayMs = v;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Show examples")
			.setDesc("Include example sentences with definitions when available.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.showExamples)
					.onChange(async (v) => {
						this.plugin.settings.showExamples = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max definitions per part of speech")
			.setDesc("Limit how many senses are shown for each part of speech.")
			.addSlider((s) =>
				s
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxDefinitionsPerEntry)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.maxDefinitionsPerEntry = v;
						await this.plugin.saveSettings();
					})
			);
	}
}
