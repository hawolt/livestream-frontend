import {
    clipEditorBoxEl,
    clipEditorCloseEl,
    clipEditorCreateEl,
    clipEditorDurationEl,
    clipEditorEl,
    clipEditorErrorEl,
    clipEditorFormEl,
    clipEditorProgressEl,
    clipEditorProgressLabelEl,
    clipEditorRangeEndEl,
    clipEditorRangeProgressEl,
    clipEditorRangeStartEl,
    clipEditorRangeTrackEl,
    clipEditorResultCopyEl,
    clipEditorResultEl,
    clipEditorResultLinkEl,
    clipEditorResultStatusEl,
    clipEditorRetryEl,
    clipEditorTitleEl,
    video,
} from "../dom.ts";
import { ctx } from "../player/context.ts";
import { bufferedEnd, bufferedStart } from "../player/mse.ts";
import { freezeForClip, resumeFromClip } from "../player/lifecycle.ts";
import { CLIP_DEFAULT_SPAN_MS, CLIP_MAX_SPAN_MS, CLIP_MIN_CAPTURE_S, CLIP_MIN_SPAN_MS, CLIP_PIN_RENEW_MS, CLIP_TITLE_MAX_LEN } from "../constants.ts";
import { behindMsFromSelection, clampClipSpan, defaultClipSpan, selectableRange } from "./span.ts";
import { formatClipDuration } from "./format.ts";
import { clipProcessingMessage } from "../../clip-processing-message.ts";
import { clipCtx, resetClipEditorState } from "./context.ts";
import { releaseClipPin, renewClipPin, requestClipPin, type ClipPin } from "./pin.ts";
import { startClipStatusPolling, stopClipStatusPolling } from "./poll.ts";
import { copyText } from "../../clipboard.ts";
import { sessionTokenMetadata } from "../../session-token.ts";
import { closeDismissibleSurface, openDismissibleSurface } from "../../dismissible-surface.ts";
import { inertSiblings, restoreInertSiblings, type InertSiblingState } from "../../inert-siblings.ts";
import { openLoginModal } from "../login-modal.ts";

let editorWired = false;
let restoreFocus: HTMLElement | null = null;
let backgroundState: InertSiblingState[] = [];
let dragging: "start" | "end" | null = null;
let renewTimer: number | null = null;

function currentToken(): string {
    return sessionStorage.getItem("dash_token") ?? "";
}

function selectionStartSeconds(): number {
    return clipCtx.selectableStartSeconds + clipCtx.startMs / 1000;
}

function selectionEndSeconds(): number {
    return clipCtx.selectableStartSeconds + clipCtx.endMs / 1000;
}

function seekPreview(ms: number): void {
    const seconds = clipCtx.selectableStartSeconds + ms / 1000;
    const clamped = Math.min(clipCtx.freezeEdgeSeconds, Math.max(clipCtx.selectableStartSeconds, seconds));
    try {
        video.currentTime = clamped;
    } catch {}
}

function stopPinRenewal(): void {
    if (renewTimer !== null) {
        window.clearInterval(renewTimer);
        renewTimer = null;
    }
}

async function renewPin(): Promise<void> {
    if (!clipCtx.open || !clipCtx.pin || clipCtx.phase !== "form") return;
    const token = currentToken();
    if (!token) return;
    const ok = await renewClipPin(ctx.username, clipCtx.pin, token);
    if (!clipCtx.open || clipCtx.phase !== "form") return;
    if (!ok) {
        stopPinRenewal();
        clipCtx.phase = "blocked";
        clipCtx.errorMessage = "Your clip session expired. Close and try again.";
        render();
    }
}

function startPinRenewal(): void {
    stopPinRenewal();
    renewTimer = window.setInterval(() => void renewPin(), CLIP_PIN_RENEW_MS);
}

function renderRange(): void {
    const span = clipCtx.selectableSpanMs || 1;
    const startPct = (clipCtx.startMs / span) * 100;
    const endPct = (clipCtx.endMs / span) * 100;
    clipEditorRangeStartEl.style.left = `${startPct}%`;
    clipEditorRangeEndEl.style.left = `${endPct}%`;
    clipEditorRangeProgressEl.style.left = `${startPct}%`;
    clipEditorRangeProgressEl.style.width = `${Math.max(0, endPct - startPct)}%`;
    clipEditorDurationEl.textContent = formatClipDuration(clipCtx.endMs - clipCtx.startMs);
}

function render(): void {
    renderRange();
    const phase = clipCtx.phase;
    clipEditorFormEl.hidden = phase !== "form";
    clipEditorProgressEl.hidden = phase !== "pinning" && phase !== "submitting" && phase !== "processing";
    clipEditorResultEl.hidden = phase !== "ready" && phase !== "failed" && phase !== "blocked";
    clipEditorErrorEl.textContent = phase === "form" ? clipCtx.errorMessage : "";
    clipEditorCreateEl.disabled = phase !== "form";
    if (phase === "pinning") {
        clipEditorProgressLabelEl.textContent = "Preparing clip...";
    } else if (phase === "submitting") {
        clipEditorProgressLabelEl.textContent = "Submitting clip...";
    } else if (phase === "processing") {
        clipEditorProgressLabelEl.textContent = clipProcessingMessage(clipCtx.jobPhase, clipCtx.jobQueuePosition, "Processing your clip...");
    }
    if (phase === "ready") {
        const url = clipCtx.clipId ? `/clip/${clipCtx.clipId}` : "";
        clipEditorResultStatusEl.textContent = "Clip ready.";
        clipEditorResultLinkEl.href = url || "#";
        clipEditorResultLinkEl.textContent = url ? `${location.origin}${url}` : "";
        clipEditorResultCopyEl.hidden = !url;
        clipEditorRetryEl.hidden = true;
    } else if (phase === "failed") {
        clipEditorResultStatusEl.textContent = clipCtx.errorMessage || "Clip processing failed.";
        clipEditorResultLinkEl.href = "#";
        clipEditorResultLinkEl.textContent = "";
        clipEditorResultCopyEl.hidden = true;
        clipEditorRetryEl.hidden = false;
    } else if (phase === "blocked") {
        clipEditorResultStatusEl.textContent = clipCtx.errorMessage || "Clips are unavailable right now.";
        clipEditorResultLinkEl.href = "#";
        clipEditorResultLinkEl.textContent = "";
        clipEditorResultCopyEl.hidden = true;
        clipEditorRetryEl.hidden = true;
    }
}

function trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(clipEditorBoxEl.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ));
    if (!focusable.length) {
        event.preventDefault();
        clipEditorBoxEl.focus();
        return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !clipEditorBoxEl.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !clipEditorBoxEl.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

async function acquireClipPin(token: string): Promise<ClipPin | null> {
    const result = await requestClipPin(ctx.username, token);
    if (!clipCtx.open) {
        if (result.ok) releaseClipPin(ctx.username, result.data.pin, token);
        return null;
    }
    if (!result.ok) {
        if (result.status === 401) {
            closeClipEditor();
            openLoginModal("clip");
            return null;
        }
        clipCtx.phase = "blocked";
        clipCtx.errorMessage = result.status === 404
            ? "This channel cannot be clipped right now."
            : result.status === 429
            ? "Too many clip requests. Please wait a moment and try again."
            : "Could not start clip creation. Try again.";
        render();
        return null;
    }
    clipCtx.pin = result.data.pin;
    return result.data;
}

export async function openClipEditor(): Promise<void> {
    if (clipCtx.open) return;
    const token = currentToken();
    if (!sessionTokenMetadata(token)) {
        openLoginModal("clip");
        return;
    }
    const end = bufferedEnd();
    const start = bufferedStart();
    if (end - start < CLIP_MIN_CAPTURE_S) return;
    resetClipEditorState();
    clipCtx.open = true;
    clipCtx.freezeEdgeSeconds = end;
    freezeForClip();
    clipEditorTitleEl.value = "";
    clipEditorEl.hidden = false;
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backgroundState = inertSiblings(clipEditorEl);
    openDismissibleSurface(clipEditorEl, closeClipEditor);
    render();
    clipEditorTitleEl.focus();

    const pin = await acquireClipPin(token);
    if (!pin) return;
    const range = selectableRange(start, end, pin.windowMs);
    clipCtx.selectableStartSeconds = range.startSeconds;
    clipCtx.selectableSpanMs = Math.max(0, (range.endSeconds - range.startSeconds) * 1000);
    const initial = defaultClipSpan(clipCtx.selectableSpanMs, CLIP_DEFAULT_SPAN_MS, CLIP_MAX_SPAN_MS);
    clipCtx.startMs = initial.startMs;
    clipCtx.endMs = initial.endMs;
    clipCtx.phase = "form";
    startPinRenewal();
    seekPreview(clipCtx.endMs);
    render();
}

export function closeClipEditor(): void {
    if (!clipCtx.open) return;
    clipCtx.open = false;
    stopPinRenewal();
    stopClipStatusPolling();
    const pin = clipCtx.pin;
    if (pin && !clipCtx.submitted) {
        const token = currentToken();
        if (token) releaseClipPin(ctx.username, pin, token);
    }
    clipCtx.pin = null;
    clipEditorEl.hidden = true;
    closeDismissibleSurface(clipEditorEl);
    restoreInertSiblings(backgroundState);
    backgroundState = [];
    const restore = restoreFocus;
    restoreFocus = null;
    if (restore?.isConnected) restore.focus();
    resumeFromClip();
}

function posFromEvent(ev: PointerEvent): number {
    const rect = clipEditorRangeTrackEl.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)) : 0;
    return frac * clipCtx.selectableSpanMs;
}

function applyDrag(pos: number): void {
    // Keep the grabbed handle on its own side of the pair; clampClipSpan would
    // otherwise swap start/end while `dragging` still names the original handle.
    const span = dragging === "start"
        ? clampClipSpan(Math.min(pos, clipCtx.endMs - CLIP_MIN_SPAN_MS), clipCtx.endMs, clipCtx.selectableSpanMs, CLIP_MIN_SPAN_MS, CLIP_MAX_SPAN_MS)
        : clampClipSpan(clipCtx.startMs, Math.max(pos, clipCtx.startMs + CLIP_MIN_SPAN_MS), clipCtx.selectableSpanMs, CLIP_MIN_SPAN_MS, CLIP_MAX_SPAN_MS);
    clipCtx.startMs = span.startMs;
    clipCtx.endMs = span.endMs;
    renderRange();
    seekPreview(dragging === "start" ? clipCtx.startMs : clipCtx.endMs);
}

function wireHandle(el: HTMLElement, which: "start" | "end"): void {
    el.addEventListener("pointerdown", (ev) => {
        dragging = which;
        try {
            el.setPointerCapture(ev.pointerId);
        } catch {}
        ev.preventDefault();
    });
    el.addEventListener("pointermove", (ev) => {
        if (dragging !== which) return;
        applyDrag(posFromEvent(ev));
    });
    const end = (ev: PointerEvent) => {
        if (dragging !== which) return;
        dragging = null;
        try {
            el.releasePointerCapture(ev.pointerId);
        } catch {}
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
}

async function parseErrorMessage(res: Response): Promise<string> {
    try {
        const data = await res.json() as { error?: string };
        return typeof data.error === "string" ? data.error : "";
    } catch {
        return "";
    }
}

async function submitClip(): Promise<void> {
    const token = currentToken();
    if (!sessionTokenMetadata(token) || !clipCtx.pin) {
        closeClipEditor();
        openLoginModal("clip");
        return;
    }
    const title = clipEditorTitleEl.value.trim().slice(0, CLIP_TITLE_MAX_LEN);
    const behind = behindMsFromSelection(clipCtx.freezeEdgeSeconds, selectionStartSeconds(), selectionEndSeconds());
    clipCtx.errorMessage = "";
    clipCtx.phase = "submitting";
    clipCtx.submitted = true;
    stopPinRenewal();
    render();
    const params = new URLSearchParams({
        channel: ctx.username,
        title,
        pin: clipCtx.pin,
        startBehindMs: String(behind.startBehindMs),
        endBehindMs: String(behind.endBehindMs),
    });
    try {
        const res = await fetch(`/api/main/v1/clips?${params.toString()}`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!clipCtx.open) return;
        if (res.status === 401) {
            closeClipEditor();
            openLoginModal("clip");
            return;
        }
        if (res.status === 429) {
            clipCtx.phase = "form";
            clipCtx.submitted = false;
            clipCtx.errorMessage = "Too many clips created. Please wait a bit and try again.";
            startPinRenewal();
            render();
            return;
        }
        if (res.status === 503) {
            clipCtx.phase = "blocked";
            clipCtx.errorMessage = "Clip creation is unavailable right now. Try again later.";
            render();
            return;
        }
        if (res.status === 409 || res.status === 410 || res.status === 422) {
            clipCtx.phase = "failed";
            clipCtx.errorMessage = await parseErrorMessage(res) || "This clip could not be created.";
            render();
            return;
        }
        if (res.status !== 202) {
            clipCtx.phase = "form";
            clipCtx.submitted = false;
            clipCtx.errorMessage = await parseErrorMessage(res) || "Clip creation failed. Try again.";
            startPinRenewal();
            render();
            return;
        }
        const data = await res.json().catch(() => ({})) as { id?: string; status?: string };
        if (typeof data.id !== "string" || !data.id) {
            clipCtx.phase = "form";
            clipCtx.submitted = false;
            clipCtx.errorMessage = "Clip creation failed. Try again.";
            startPinRenewal();
            render();
            return;
        }
        clipCtx.clipId = data.id;
        clipCtx.phase = "processing";
        render();
        startClipStatusPolling(render);
    } catch {
        if (!clipCtx.open) return;
        clipCtx.phase = "form";
        clipCtx.submitted = false;
        clipCtx.errorMessage = "Could not reach the server. Try again.";
        startPinRenewal();
        render();
    }
}

async function retryClip(): Promise<void> {
    const token = currentToken();
    if (!sessionTokenMetadata(token)) {
        closeClipEditor();
        openLoginModal("clip");
        return;
    }
    stopClipStatusPolling();
    // The pin that led here is consumed or invalid; a retry needs a fresh one.
    clipCtx.phase = "pinning";
    clipCtx.pin = null;
    clipCtx.clipId = null;
    clipCtx.resultUrl = null;
    clipCtx.errorMessage = "";
    clipCtx.pollGeneration += 1;
    clipCtx.submitted = false;
    render();
    if (!(await acquireClipPin(token))) return;
    clipCtx.phase = "form";
    startPinRenewal();
    render();
}

export function wireClipEditor(): void {
    if (editorWired) return;
    editorWired = true;
    clipEditorCloseEl.addEventListener("click", () => closeClipEditor());
    clipEditorEl.addEventListener("click", (ev) => {
        if (ev.target === clipEditorEl) closeClipEditor();
    });
    document.addEventListener("keydown", (ev) => {
        if (clipEditorEl.hidden) return;
        if (ev.key === "Tab") trapFocus(ev);
    });
    wireHandle(clipEditorRangeStartEl, "start");
    wireHandle(clipEditorRangeEndEl, "end");
    clipEditorFormEl.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void submitClip();
    });
    clipEditorResultCopyEl.addEventListener("click", () => {
        const url = clipCtx.clipId ? `${location.origin}/clip/${clipCtx.clipId}` : "";
        if (!url) return;
        void copyText(url).then((copied) => {
            clipEditorResultCopyEl.textContent = copied ? "Copied" : "Failed";
            window.setTimeout(() => {
                clipEditorResultCopyEl.textContent = "Copy link";
            }, 1200);
        });
    });
    clipEditorRetryEl.addEventListener("click", () => void retryClip());
}
