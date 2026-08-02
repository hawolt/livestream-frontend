import { ctx, emotes, myNickLower } from "./context.ts";
import { inputEl, suggestEl } from "./dom.ts";
import { memberDisplay, nickColor } from "./members.ts";
import {
    applyReplacement,
    matchEmotes,
    matchMembers,
    suggestContextFor,
    wrapIndex,
    type SuggestItem,
} from "./suggest-match.ts";

function currentWordRange(): { start: number; end: number; word: string } | null {
    const val = inputEl.value;
    const caret = inputEl.selectionStart ?? val.length;
    if (inputEl.selectionEnd !== caret) return null;
    let start = caret;
    while (start > 0 && !/\s/.test(val[start - 1])) start--;
    let end = caret;
    while (end < val.length && !/\s/.test(val[end])) end++;
    return { start, end, word: val.slice(start, end) };
}

export function acceptSuggestion(name: string): void {
    const range = currentWordRange();
    if (!range) return;
    const { value } = applyReplacement(inputEl.value, range, name + " ");
    inputEl.value = value;
    const caret = range.start + name.length + 1;
    inputEl.setSelectionRange(caret, caret);
    inputEl.focus();
    hideSuggest();
}

export function hideSuggest(): void {
    suggestEl.hidden = true;
    suggestEl.replaceChildren();
    ctx.suggestIndex = -1;
    ctx.suggestItemsData = [];
    ctx.tabCycleRange = null;
}

function suggestItems(): HTMLElement[] {
    return Array.from(suggestEl.querySelectorAll<HTMLElement>(".live-chat-suggest-item"));
}

function highlightSuggest(): void {
    const items = suggestItems();
    items.forEach((it, i) => it.classList.toggle("sel", i === ctx.suggestIndex));
    items[ctx.suggestIndex]?.scrollIntoView({ block: "nearest" });
}

export function moveSuggest(delta: number): void {
    const items = suggestItems();
    if (!items.length) return;
    ctx.suggestIndex = wrapIndex(ctx.suggestIndex, delta, items.length);
    highlightSuggest();
}

export function acceptSelectedSuggestion(): boolean {
    const items = suggestItems();
    const cur = items[ctx.suggestIndex >= 0 ? ctx.suggestIndex : 0];
    if (!cur) return false;
    cur.click();
    return true;
}

export function advanceTabCycle(back: boolean): void {
    if (!ctx.tabCycleRange) {
        const range = currentWordRange();
        if (!range) return;
        ctx.tabCycleRange = { start: range.start, end: range.end };
        highlightSuggest();
    } else {
        moveSuggest(back ? -1 : 1);
    }
    const item = ctx.suggestItemsData[ctx.suggestIndex];
    if (!item || !ctx.tabCycleRange) return;
    const { value, end } = applyReplacement(inputEl.value, ctx.tabCycleRange, item.insert + " ");
    inputEl.value = value;
    ctx.tabCycleRange = { start: ctx.tabCycleRange.start, end };
    inputEl.setSelectionRange(end, end);
    inputEl.focus();
}

function suggestContext(): ReturnType<typeof suggestContextFor> {
    const range = currentWordRange();
    if (!range) return null;
    return suggestContextFor(range.word, inputEl.value, range.start);
}

function renderSuggestItems(items: SuggestItem[]): void {
    ctx.tabCycleRange = null;
    suggestEl.replaceChildren();
    if (!items.length) {
        suggestEl.hidden = true;
        ctx.suggestItemsData = [];
        return;
    }
    ctx.suggestItemsData = items;
    for (const it of items) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "live-chat-suggest-item";
        if (it.img) {
            const img = document.createElement("img");
            img.src = it.img;
            img.referrerPolicy = "no-referrer";
            img.alt = it.label;
            img.loading = "lazy";
            item.appendChild(img);
        } else if (it.color) {
            const dot = document.createElement("span");
            dot.className = "live-chat-suggest-dot";
            dot.style.background = it.color;
            item.appendChild(dot);
        }
        const label = document.createElement("span");
        label.textContent = it.label;
        item.appendChild(label);
        item.addEventListener("click", () => acceptSuggestion(it.insert));
        item.addEventListener("mousemove", () => {
            ctx.suggestIndex = suggestItems().indexOf(item);
            highlightSuggest();
        });
        suggestEl.appendChild(item);
    }
    suggestEl.hidden = false;
    ctx.suggestIndex = 0;
    highlightSuggest();
}

export function updateSuggest(): void {
    if (ctx.pickerOpen) {
        hideSuggest();
        return;
    }
    const sc = suggestContext();
    if (!sc) {
        hideSuggest();
        return;
    }
    if (sc.kind === "emote") {
        renderSuggestItems(matchEmotes(sc.term, emotes.names()).map((name) => ({ label: name, insert: name, img: emotes.get(name)?.url })));
    } else {
        renderSuggestItems(matchMembers(sc.term, memberDisplay, myNickLower()).map((name) => ({ label: name, insert: (sc.withAt ? "@" : "") + name, color: nickColor(name) })));
    }
}
