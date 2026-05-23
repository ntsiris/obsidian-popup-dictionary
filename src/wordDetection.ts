// Detects the word under the mouse pointer, or within the current selection.
//
// Word boundaries are found with Intl.Segmenter (granularity "word"), which is
// what makes this work across many languages: it correctly segments scripts that
// do not use spaces between words (Chinese, Japanese, Thai, Khmer, ...). When the
// runtime lacks Intl.Segmenter we fall back to a Unicode-aware regex that handles
// space-delimited scripts.

export interface WordHit {
	word: string;
	range: Range;
}

// --- Minimal typings for Intl.Segmenter ---------------------------------------
// Not present in every TypeScript lib target, so we type it locally and access it
// via a cast rather than relying on the global lib declaration.
interface SegmentData {
	segment: string;
	index: number;
	isWordLike?: boolean;
}
interface SegmenterLike {
	segment(input: string): Iterable<SegmentData>;
}
interface SegmenterCtor {
	new (
		locales?: string | string[],
		options?: { granularity?: "grapheme" | "word" | "sentence" }
	): SegmenterLike;
}

let cachedSegmenter: SegmenterLike | null | undefined;

function getSegmenter(): SegmenterLike | null {
	if (cachedSegmenter !== undefined) return cachedSegmenter;
	const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
	try {
		cachedSegmenter = ctor ? new ctor(undefined, { granularity: "word" }) : null;
	} catch {
		cachedSegmenter = null;
	}
	return cachedSegmenter;
}

// Letters, numbers and combining marks. The "u" flag enables Unicode property escapes.
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

function caretRangeFromPoint(doc: Document, x: number, y: number): Range | null {
	const anyDoc = doc as unknown as {
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
		caretPositionFromPoint?: (
			x: number,
			y: number
		) => { offsetNode: Node; offset: number } | null;
	};
	// Chromium (Obsidian desktop) supports caretRangeFromPoint.
	if (typeof anyDoc.caretRangeFromPoint === "function") {
		return anyDoc.caretRangeFromPoint(x, y);
	}
	// Firefox-style fallback, kept for completeness.
	if (typeof anyDoc.caretPositionFromPoint === "function") {
		const pos = anyDoc.caretPositionFromPoint(x, y);
		if (!pos) return null;
		const r = doc.createRange();
		r.setStart(pos.offsetNode, pos.offset);
		r.collapse(true);
		return r;
	}
	return null;
}

// Returns the [start, end) bounds of the word in `text` containing `offset`.
function wordBoundsAt(text: string, offset: number): [number, number] | null {
	const seg = getSegmenter();
	if (seg) {
		let lastWordEnd: [number, number] | null = null;
		for (const part of seg.segment(text)) {
			const start = part.index;
			const end = start + part.segment.length;
			if (!part.isWordLike) continue;
			if (offset >= start && offset < end) return [start, end];
			// Remember a word that ends exactly at the caret (caret on a boundary).
			if (offset === end) lastWordEnd = [start, end];
		}
		return lastWordEnd;
	}

	// Regex fallback: expand around the offset over word characters.
	if (offset < 0 || offset > text.length) return null;
	let pivot = offset;
	if (pivot === text.length || !WORD_CHAR.test(text.charAt(pivot))) {
		// Caret sits just after a word; step back one character.
		if (pivot > 0 && WORD_CHAR.test(text.charAt(pivot - 1))) {
			pivot -= 1;
		} else {
			return null;
		}
	}
	let start = pivot;
	while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) start -= 1;
	let end = pivot + 1;
	while (end < text.length && WORD_CHAR.test(text.charAt(end))) end += 1;
	return start < end ? [start, end] : null;
}

export function getWordAtPoint(doc: Document, x: number, y: number): WordHit | null {
	const caret = caretRangeFromPoint(doc, x, y);
	if (!caret) return null;
	const node = caret.startContainer;
	if (node.nodeType !== Node.TEXT_NODE) return null;
	const text = node.textContent ?? "";
	if (!text) return null;

	const bounds = wordBoundsAt(text, caret.startOffset);
	if (!bounds) return null;
	const [start, end] = bounds;
	const word = text.slice(start, end).trim();
	if (!word) return null;

	const range = doc.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	return { word, range };
}

const MAX_SELECTION_LEN = 80;

export interface SelectionHit {
	word: string;
	rect: DOMRect;
}

export function getSelectedWord(win: Window): SelectionHit | null {
	const sel = win.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
	const raw = sel.toString().trim();
	if (!raw || raw.length > MAX_SELECTION_LEN) return null;
	const rect = sel.getRangeAt(0).getBoundingClientRect();
	return { word: raw, rect };
}
