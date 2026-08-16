import { setRaidHandover } from "../chat/raid.ts";
import { canStartPrewarm } from "./player/handover-decision.ts";
import { cancelPrewarm, startPrewarm, takeReadyPrewarm, type PrewarmChannel, type PrewarmResult } from "./player/prewarm.ts";
import { ctx, nextGen } from "./player/context.ts";
import { browseMiniUsername, nameEl, partnerBadgeEl, setVideoElement, video } from "./dom.ts";
import { beginTransport, clearRetryTimer, fullTeardown, resetRetryBackoff, setOfflineArt } from "./player/lifecycle.ts";
import { resetStreamInfo, rewatchViewcount } from "./stream-info.ts";
import { attachVideoElementListeners, updatePlayIcon, updateVolumeUI } from "./controls.ts";
import { applyChannelChrome } from "./channel-chrome.ts";
import { startChat } from "../live-chat.ts";
import { msgsEl } from "../chat/dom.ts";
import { openLoginModal } from "./login-modal.ts";
import { initFollow } from "./follow.ts";
import { loadProfile, offlineArtUrl } from "../profile-card.ts";
import { QUALITY_SOURCE } from "../quality.ts";

function mediaSourceSupported(): boolean {
    return typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function";
}

function performHandover(result: PrewarmResult): void {
    const { adoption, channel, videoEl } = result;
    adoption.sock.send("promote");
    const oldVideo = video;
    const volume = oldVideo.volume;
    const muted = oldVideo.muted;
    nextGen();
    clearRetryTimer();
    fullTeardown();
    resetStreamInfo();
    oldVideo.removeAttribute("id");
    videoEl.classList.remove("live-video-prewarm");
    videoEl.removeAttribute("class");
    videoEl.id = "live-video";
    videoEl.muted = muted;
    videoEl.volume = volume;
    oldVideo.replaceWith(videoEl);
    setVideoElement(videoEl);
    attachVideoElementListeners(videoEl);
    void videoEl.play().catch(() => {});
    updatePlayIcon();
    updateVolumeUI();
    ctx.username = channel.target.toLowerCase();
    ctx.displayUsername = channel.displayUsername;
    ctx.mediaBase = channel.mediaBase;
    ctx.wssBase = channel.wssBase;
    ctx.clipsDisabled = channel.clipsDisabled;
    ctx.qualityLadder = [];
    ctx.qualityLadderKnown = false;
    ctx.activeQuality = QUALITY_SOURCE;
    ctx.requestedQuality = QUALITY_SOURCE;
    ctx.behindLive = false;
    ctx.overflowReconnects = 0;
    resetRetryBackoff();
    history.pushState({ liveChannel: true }, "", `/${encodeURIComponent(channel.target)}`);
    ctx.adopt = adoption;
    beginTransport();
    repointPage(channel);
}

function repointPage(channel: PrewarmChannel): void {
    nameEl.textContent = ctx.displayUsername;
    partnerBadgeEl.hidden = !channel.partner;
    document.title = ctx.displayUsername;
    browseMiniUsername.textContent = ctx.displayUsername;
    applyChannelChrome(channel);
    msgsEl.replaceChildren();
    startChat(channel.target, channel.emoteTwitchId, () => openLoginModal("chat"));
    void initFollow();
    rewatchViewcount();
    void loadProfile(channel.target).then((profile) => {
        if (profile && ctx.username === channel.target) setOfflineArt(offlineArtUrl(profile));
    });
}

export function installRaidHandover(): void {
    setRaidHandover({
        begin(target: string): void {
            const eligible = canStartPrewarm({
                transportKind: ctx.transportKind,
                mediaSourceSupported: mediaSourceSupported(),
                terminal: ctx.terminal,
                target,
                currentUsername: ctx.username,
            });
            if (eligible) startPrewarm(target);
        },
        cancel(): void {
            cancelPrewarm();
        },
        join(target: string): boolean {
            const result = takeReadyPrewarm(target);
            if (!result) {
                cancelPrewarm();
                return false;
            }
            try {
                performHandover(result);
                return true;
            } catch (e) {
                console.warn("live: raid handover failed, navigating", e);
                cancelPrewarm();
                return false;
            }
        },
    });
    window.addEventListener("pagehide", cancelPrewarm);
}
