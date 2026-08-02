import { createChannelRail } from "../channel-rail.ts";
import {
    channelCountEl,
    channelListEl,
    channelRailEl,
    channelRailToggleEl,
    channelRailToggleGlyphEl,
    channelStatusEl,
} from "./dom.ts";
import { type FullscreenDoc } from "./fullscreen.ts";
import { fitChat } from "./layout.ts";
import { ctx } from "./player/context.ts";

function isRailVisible(): boolean {
    const d = document as FullscreenDoc;
    const fullscreenElement = document.fullscreenElement ?? d.webkitFullscreenElement;
    const fullscreenContainsRail = !fullscreenElement
        || fullscreenElement === document.documentElement
        || fullscreenElement.contains(channelRailEl);
    return !document.body.classList.contains("browse-mode") && fullscreenContainsRail;
}

const rail = createChannelRail({
    elements: {
        rail: channelRailEl,
        toggle: channelRailToggleEl,
        glyph: channelRailToggleGlyphEl,
        list: channelListEl,
        count: channelCountEl,
        status: channelStatusEl,
    },
    getActiveUsername: () => ctx.username,
    onCollapsedChange: fitChat,
    isVisible: isRailVisible,
});

export function startChannelRail(): void {
    rail.start();
}

export function syncChannelRailVisibility(): void {
    rail.syncVisibility();
}
