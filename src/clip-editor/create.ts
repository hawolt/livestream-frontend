import { formEl, titleInputEl } from "./dom.ts";
import { PIN_RENEW_MS, state, TITLE_MAX_LEN } from "./context.ts";
import { behindMsFromSelection } from "./behind.ts";
import { createClip, releaseClipPin, renewClipPin } from "./pin-api.ts";
import { currentToken, redirectToLogin } from "./session.ts";
import { render } from "./render.ts";
import { startClipStatusPolling, stopClipStatusPolling } from "../clip-status-poll.ts";

let renewTimer: number | null = null;

export function stopPinRenewal(): void {
    if (renewTimer !== null) {
        window.clearInterval(renewTimer);
        renewTimer = null;
    }
}

async function renewPin(): Promise<void> {
    if (!state.pin || state.phase !== "ready") return;
    const token = currentToken();
    if (!token) return;
    const ok = await renewClipPin(state.channel, state.pin, token);
    if (state.phase !== "ready") return;
    if (!ok) {
        stopPinRenewal();
        state.phase = "blocked";
        state.errorMessage = "Your clip session expired. Reload the page and try again.";
        render();
    }
}

export function startPinRenewal(): void {
    stopPinRenewal();
    renewTimer = window.setInterval(() => void renewPin(), PIN_RENEW_MS);
}

export function releasePinIfHeld(): void {
    if (state.pin && !state.submitted) {
        const token = currentToken();
        if (token) releaseClipPin(state.channel, state.pin, token);
    }
}

async function submitClip(): Promise<void> {
    const token = currentToken();
    if (!token || !state.pin) {
        redirectToLogin();
        return;
    }
    const title = titleInputEl.value.trim().slice(0, TITLE_MAX_LEN);
    const behind = behindMsFromSelection(state.nowMs, state.selectionStartMs, state.selectionEndMs);
    state.errorMessage = "";
    state.phase = "submitting";
    state.submitted = true;
    stopPinRenewal();
    render();
    const result = await createClip(state.channel, title, state.pin, behind.startBehindMs, behind.endBehindMs, token);
    if (result.status === 401) {
        redirectToLogin();
        return;
    }
    if (result.status === 429) {
        state.phase = "ready";
        state.submitted = false;
        state.errorMessage = "Too many clips created. Please wait a bit and try again.";
        startPinRenewal();
        render();
        return;
    }
    if (result.status === 503) {
        state.phase = "blocked";
        state.errorMessage = "Clip creation is unavailable right now. Try again later.";
        render();
        return;
    }
    if (result.status === 409 || result.status === 410 || result.status === 422) {
        state.phase = "create-failed";
        state.errorMessage = result.error || "This clip could not be created.";
        render();
        return;
    }
    if (!result.ok || !result.id) {
        state.phase = "ready";
        state.submitted = false;
        state.errorMessage = result.error || "Clip creation failed. Try again.";
        startPinRenewal();
        render();
        return;
    }
    state.clipCode = result.id;
    state.phase = "processing";
    render();
    startClipStatusPolling(result.id, (next) => {
        if (next === "not-found" || next === null) return;
        state.jobPhase = next.phase;
        state.jobQueuePosition = next.queuePosition;
        if (next.status === "ready" || next.status === "failed") {
            stopClipStatusPolling();
            if (next.status === "failed") {
                state.phase = "create-failed";
                state.errorMessage = next.error || "Clip processing failed.";
            } else {
                state.phase = "done";
            }
        }
        render();
    });
}

export function wireCreateForm(): void {
    formEl.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void submitClip();
    });
}
