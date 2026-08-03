import { stageEl, video } from "./dom.ts";

const HIDE_DELAY_MS = 2500;

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHideTimer(): void {
    if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
}

function show(): void {
    clearHideTimer();
    stageEl.classList.add("chrome-visible");
}

function hide(): void {
    clearHideTimer();
    stageEl.classList.remove("chrome-visible");
}

function showThenFade(): void {
    show();
    if (video.paused) return;
    hideTimer = setTimeout(hide, HIDE_DELAY_MS);
}

export function wireChromeVisibility(): void {
    stageEl.addEventListener("pointerenter", showThenFade);
    stageEl.addEventListener("pointermove", showThenFade);
    stageEl.addEventListener("pointerdown", showThenFade);
    stageEl.addEventListener("pointerleave", () => {
        if (!video.paused) hide();
    });
    video.addEventListener("pause", show);
    video.addEventListener("play", showThenFade);
    video.addEventListener("ended", show);
}
