import { msgsEl } from "./dom.ts";

const SCROLL_SLACK_PX = 40;

let pinned = true;
let scrollPinningWired = false;

function atBottom(): boolean {
    return msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < SCROLL_SLACK_PX;
}

function stickToBottom(): void {
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

export function restickIfPinned(): void {
    if (pinned) stickToBottom();
}

export function wireScrollPinning(): void {
    if (scrollPinningWired) return;
    scrollPinningWired = true;
    msgsEl.addEventListener("scroll", () => {
        pinned = atBottom();
    });
    msgsEl.addEventListener("load", restickIfPinned, true);
    new ResizeObserver(restickIfPinned).observe(msgsEl);
}

export function preserveMessagesScroll(mutate: () => void): void {
    const previousHeight = msgsEl.scrollHeight;
    mutate();
    if (pinned) {
        stickToBottom();
    } else {
        msgsEl.scrollTop += msgsEl.scrollHeight - previousHeight;
    }
}
