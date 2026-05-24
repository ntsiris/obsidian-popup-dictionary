import { Plugin } from "obsidian";
import {
	DEFAULT_SETTINGS,
	PopupDictionarySettingTab,
	type PopupDictionarySettings,
} from "./settings";

export default class PopupDictionaryPlugin extends Plugin {
	settings: PopupDictionarySettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new PopupDictionarySettingTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
