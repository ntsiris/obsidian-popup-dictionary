import { requestUrl, type RequestUrlResponse } from "obsidian";

// Client for the Wiktionary REST "definition" endpoint, which returns definitions
// for a word grouped by language. The English edition alone glosses words from
// thousands of languages, which is what gives this plugin broad language coverage.

export interface Definition {
	/** Definition text as an HTML fragment (contains <a>, <b>, <i>, ...). */
	html: string;
	/** Example sentences as HTML fragments. */
	examples: string[];
}

export interface Entry {
	partOfSpeech: string;
	definitions: Definition[];
}

export interface LangSection {
	code: string;
	name: string;
	entries: Entry[];
}

export interface DictionaryResult {
	word: string;
	edition: string;
	/** Link to the human-readable Wiktionary page. */
	url: string;
	langs: LangSection[];
}

// Raw shape of the REST response (object keyed by language code).
interface RawDefinition {
	definition?: string;
	examples?: string[];
	parsedExamples?: { example?: string }[];
}
interface RawEntry {
	partOfSpeech?: string;
	language?: string;
	definitions?: RawDefinition[];
}
type RawResponse = Record<string, RawEntry[]>;

const CACHE_LIMIT = 200;
const EDITION_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/;

export class DictionaryClient {
	private cache = new Map<string, DictionaryResult | null>();
	private inflight = new Map<string, Promise<DictionaryResult | null>>();

	constructor(private getEdition: () => string) {}

	private normalizeEdition(): string {
		const e = (this.getEdition() || "en").trim().toLowerCase();
		return EDITION_RE.test(e) ? e : "en";
	}

	wiktionaryPageUrl(word: string): string {
		return `https://${this.normalizeEdition()}.wiktionary.org/wiki/${encodeURIComponent(
			word
		)}`;
	}

	/**
	 * Look up a word. Resolves to a result, or `null` when the word has no entry.
	 * Rejects only on network / unexpected server errors.
	 */
	async lookup(rawWord: string): Promise<DictionaryResult | null> {
		const word = rawWord.trim();
		if (!word) return null;
		const edition = this.normalizeEdition();
		const key = `${edition}:${word}`;

		if (this.cache.has(key)) return this.cache.get(key) ?? null;
		const pending = this.inflight.get(key);
		if (pending) return pending;

		const promise = this.fetchAndParse(word, edition)
			.then((result) => {
				this.put(key, result);
				return result;
			})
			.finally(() => {
				this.inflight.delete(key);
			});
		this.inflight.set(key, promise);
		return promise;
	}

	private put(key: string, value: DictionaryResult | null): void {
		this.cache.set(key, value);
		if (this.cache.size > CACHE_LIMIT) {
			const oldest = this.cache.keys().next().value;
			if (oldest !== undefined) this.cache.delete(oldest);
		}
	}

	private async fetchAndParse(
		word: string,
		edition: string
	): Promise<DictionaryResult | null> {
		const direct = await this.fetchOne(word, edition);
		if (direct) return direct;
		// Wiktionary titles are case-sensitive; retry a lower-cased variant.
		const lower = word.toLocaleLowerCase();
		if (lower !== word) {
			const alt = await this.fetchOne(lower, edition);
			if (alt) return alt;
		}
		return null;
	}

	private async fetchOne(
		word: string,
		edition: string
	): Promise<DictionaryResult | null> {
		const url = `https://${edition}.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(
			word
		)}`;

		let resp: RequestUrlResponse;
		try {
			resp = await requestUrl({ url, method: "GET", throw: false });
		} catch {
			throw new Error("Could not reach Wiktionary (offline?).");
		}

		if (resp.status === 404) return null;
		if (resp.status < 200 || resp.status >= 300) {
			throw new Error(`Wiktionary returned HTTP ${resp.status}.`);
		}

		let data: unknown;
		try {
			data = resp.json;
		} catch {
			throw new Error("Could not read the Wiktionary response.");
		}
		if (!data || typeof data !== "object") return null;
		return this.parse(word, edition, data as RawResponse);
	}

	private parse(
		word: string,
		edition: string,
		data: RawResponse
	): DictionaryResult | null {
		const langs: LangSection[] = [];

		for (const code of Object.keys(data)) {
			const rawEntries = data[code];
			if (!Array.isArray(rawEntries) || rawEntries.length === 0) continue;

			const entries: Entry[] = [];
			let name = code;

			for (const re of rawEntries) {
				if (re.language) name = re.language;
				const defs: Definition[] = [];

				for (const rd of re.definitions ?? []) {
					const html = (rd.definition ?? "").trim();
					if (!html) continue;

					const examples: string[] = [];
					if (Array.isArray(rd.parsedExamples)) {
						for (const ex of rd.parsedExamples) {
							if (ex && ex.example) examples.push(ex.example);
						}
					}
					if (examples.length === 0 && Array.isArray(rd.examples)) {
						for (const ex of rd.examples) if (ex) examples.push(ex);
					}

					defs.push({ html, examples });
				}

				if (defs.length > 0) {
					entries.push({
						partOfSpeech: re.partOfSpeech ?? "",
						definitions: defs,
					});
				}
			}

			if (entries.length > 0) langs.push({ code, name, entries });
		}

		if (langs.length === 0) return null;
		return {
			word,
			edition,
			url: this.wiktionaryPageUrl(word),
			langs,
		};
	}
}
