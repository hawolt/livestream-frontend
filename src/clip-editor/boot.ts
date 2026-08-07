import Hls from "hls.js";
import { resultCopyEl, videoEl } from "./dom.ts";
import { parseChannelParam } from "./channel.ts";
import { ensureSession, redirectToLogin } from "./session.ts";
import { requestClipPin } from "./pin-api.ts";
import { clipPlaylistUrl, createClipHls, fetchPinMediaHeaders } from "./media.ts";
import { clipShareUrl, DEFAULT_SPAN_MS, state } from "./context.ts";
import { render, setBuffering, setChannelLabel, setQuotaNotice, showBody, showStateMessage } from "./render.ts";
import { renderTimeline } from "./timeline-render.ts";
import { wireTimeline } from "./timeline-interactions.ts";
import { wirePlaybackControls } from "./controls.ts";
import { releasePinIfHeld, startPinRenewal, stopPinRenewal, wireCreateForm, wireResultRetry } from "./create.ts";
import { copyText } from "../clipboard.ts";

let mediaCancelled = false;
let hls: Hls | null = null;

function isMediaCancelled(): boolean {
    return mediaCancelled;
}

function teardownHls(): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
}

function wireBufferingIndicator(): void {
    videoEl.addEventListener("waiting", () => setBuffering(true));
    videoEl.addEventListener("playing", () => setBuffering(false));
    videoEl.addEventListener("canplay", () => setBuffering(false));
}

function handleHlsError(_event: unknown, data: { fatal: boolean; details: string; type: string }, onFatalDuringLoad: () => void): void {
    if (data.details === Hls.ErrorDetails.BUFFER_FULL_ERROR) {
        setQuotaNotice(true);
        return;
    }
    if (!data.fatal || isMediaCancelled() || !hls) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
    }
    onFatalDuringLoad();
}

async function loadMediaIntoVideo(): Promise<boolean> {
    if (!Hls.isSupported()) {
        state.phase = "media-error";
        showStateMessage("This browser cannot preview clip media.", false);
        return false;
    }
    const playlistUrl = clipPlaylistUrl(state.channel, state.pin!);
    setBuffering(true, "Loading player...");
    const headers = await fetchPinMediaHeaders(playlistUrl, state.token);
    if (isMediaCancelled()) return false;
    if (!headers) {
        state.phase = "media-error";
        showStateMessage("Could not load this clip window. Try again.", false);
        return false;
    }
    state.nowMs = headers.nowMs;
    state.windowMs = headers.windowMs;
    state.mediaStartMs = headers.mediaStartMs;

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };
        hls = createClipHls(state.token);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (isMediaCancelled() || !hls) return;
            hls.loadSource(playlistUrl);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (isMediaCancelled()) return;
            setBuffering(false);
            finish(true);
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
            handleHlsError(event, data, () => {
                state.phase = "media-error";
                showStateMessage("Could not load this clip window. Try again.", false);
                finish(false);
            });
        });
        hls.attachMedia(videoEl);
    });
}

function wireResultCopy(): void {
    resultCopyEl.addEventListener("click", () => {
        const url = clipShareUrl();
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
        showStateMessage("Missing or invalid channel.", false);
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
            showStateMessage("This channel cannot be clipped right now.", false);
            return;
        }
        if (pinResult.status === 403) {
            state.phase = "blocked";
            showStateMessage("Clips are disabled for private and ticketed channels.", false);
            return;
        }
        if (pinResult.status === 429) {
            state.phase = "blocked";
            showStateMessage("Too many clip requests. Please wait a moment and try again.", false);
            return;
        }
        state.phase = "blocked";
        showStateMessage("Could not start clip creation. Try again.", false);
        return;
    }
    state.pin = pinResult.data.pin;
    state.nowMs = pinResult.data.nowMs;
    state.windowMs = pinResult.data.windowMs;

    state.phase = "loading-media";
    showBody();
    wireBufferingIndicator();
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
    wireResultRetry();
    startPinRenewal();

    window.addEventListener("pagehide", () => {
        mediaCancelled = true;
        stopPinRenewal();
        releasePinIfHeld();
        teardownHls();
    });
}
