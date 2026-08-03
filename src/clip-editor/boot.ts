import { resultCopyEl, videoEl } from "./dom.ts";
import { parseChannelParam } from "./channel.ts";
import { ensureSession, redirectToLogin } from "./session.ts";
import { requestClipPin } from "./pin-api.ts";
import { pickSupportedMimeType, streamPinMedia } from "./media.ts";
import { DEFAULT_SPAN_MS, state } from "./context.ts";
import { render, setChannelLabel, setLoadProgress, showBody, showStateMessage } from "./render.ts";
import { renderTimeline } from "./timeline-render.ts";
import { wireTimeline } from "./timeline-interactions.ts";
import { wirePlaybackControls } from "./controls.ts";
import { releasePinIfHeld, startPinRenewal, stopPinRenewal, wireCreateForm } from "./create.ts";
import { copyText } from "../clipboard.ts";

let mediaCancelled = false;

function isMediaCancelled(): boolean {
    return mediaCancelled;
}

async function loadMediaIntoVideo(): Promise<boolean> {
    const mime = pickSupportedMimeType();
    if (!mime || typeof MediaSource === "undefined") {
        state.phase = "media-error";
        showStateMessage("This browser cannot preview clip media.");
        return false;
    }
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    videoEl.src = objectUrl;
    const sourceBuffer = await new Promise<SourceBuffer>((resolve) => {
        mediaSource.addEventListener("sourceopen", () => {
            URL.revokeObjectURL(objectUrl);
            resolve(mediaSource.addSourceBuffer(mime));
        }, { once: true });
    });
    sourceBuffer.mode = "segments";
    setLoadProgress(0, true);
    const headers = await streamPinMedia(state.channel, state.pin!, state.token, sourceBuffer, (fraction) => {
        setLoadProgress(fraction, true);
    }, isMediaCancelled);
    if (isMediaCancelled()) return false;
    if (!headers) {
        state.phase = "media-error";
        showStateMessage("Could not load this clip window. Try again.");
        return false;
    }
    state.nowMs = headers.nowMs;
    state.windowMs = headers.windowMs;
    state.mediaStartMs = headers.mediaStartMs;
    setLoadProgress(1, false);
    try {
        if (mediaSource.readyState === "open") mediaSource.endOfStream();
    } catch {}
    return true;
}

function wireResultCopy(): void {
    resultCopyEl.addEventListener("click", () => {
        const url = state.clipCode ? `${location.origin}/${state.channel}/clip/${state.clipCode}` : "";
        if (!url) return;
        void copyText(url).then((copied) => {
            resultCopyEl.textContent = copied ? "Copied" : "Failed";
            window.setTimeout(() => {
                resultCopyEl.textContent = "Copy link";
            }, 1200);
        });
    });
}

export async function boot(): Promise<void> {
    const channel = parseChannelParam(location.search);
    if (!channel) {
        state.phase = "invalid-channel";
        showStateMessage("Missing or invalid channel.");
        return;
    }
    state.channel = channel;
    setChannelLabel(channel);

    const token = await ensureSession();
    if (token) state.token = token;
    if (!token) {
        redirectToLogin();
        return;
    }

    state.phase = "pinning";
    showStateMessage("Preparing your clip window...");
    const pinResult = await requestClipPin(channel, token);
    if (!pinResult.ok) {
        if (pinResult.status === 401) {
            redirectToLogin();
            return;
        }
        if (pinResult.status === 404) {
            state.phase = "channel-offline";
            showStateMessage("This channel cannot be clipped right now.");
            return;
        }
        if (pinResult.status === 429) {
            state.phase = "blocked";
            showStateMessage("Too many clip requests. Please wait a moment and try again.");
            return;
        }
        state.phase = "blocked";
        showStateMessage("Could not start clip creation. Try again.");
        return;
    }
    state.pin = pinResult.data.pin;
    state.nowMs = pinResult.data.nowMs;
    state.windowMs = pinResult.data.windowMs;

    state.phase = "loading-media";
    showBody();
    const loaded = await loadMediaIntoVideo();
    if (!loaded) return;

    state.selectionEndMs = state.nowMs;
    state.selectionStartMs = Math.max(state.mediaStartMs, state.nowMs - DEFAULT_SPAN_MS);
    state.viewStartMs = state.mediaStartMs;
    state.viewEndMs = state.nowMs;

    state.phase = "ready";
    render();
    renderTimeline(state.mediaStartMs);
    wireTimeline();
    wirePlaybackControls();
    wireCreateForm();
    wireResultCopy();
    startPinRenewal();

    window.addEventListener("pagehide", () => {
        mediaCancelled = true;
        stopPinRenewal();
        releasePinIfHeld();
    });
}
