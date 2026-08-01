import { btnCinema } from "./dom.ts";
import { currentEffectiveLayout, isPopoutMode, scheduleFullscreenSettle } from "./layout.ts";
import { exitChatFullscreen, isChatFsActive } from "./fullscreen.ts";
import { syncChannelRailVisibility } from "./channel-rail.ts";

let cinemaMode = false;

export function isCinemaMode(): boolean {
    return cinemaMode;
}

export function enterCinemaMode(): void {
    if (cinemaMode || isPopoutMode() || currentEffectiveLayout() === "vertical") return;
    if (isChatFsActive()) exitChatFullscreen();
    cinemaMode = true;
    document.body.classList.add("cinema-mode");
    btnCinema.classList.add("active");
    btnCinema.setAttribute("aria-label", "Exit cinema mode");
    btnCinema.title = "Exit cinema mode";
    syncChannelRailVisibility();
    scheduleFullscreenSettle();
}

export function exitCinemaMode(): void {
    if (!cinemaMode) return;
    cinemaMode = false;
    document.body.classList.remove("cinema-mode");
    btnCinema.classList.remove("active");
    btnCinema.setAttribute("aria-label", "Cinema mode");
    btnCinema.title = "Cinema mode";
    syncChannelRailVisibility();
    scheduleFullscreenSettle();
}

export function toggleCinemaMode(): void {
    if (cinemaMode) exitCinemaMode();
    else enterCinemaMode();
}
