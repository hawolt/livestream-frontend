import { btnClip } from "../dom.ts";
import { ctx } from "../player/context.ts";
import { bufferedEnd, bufferedStart } from "../player/mse.ts";
import { CLIP_MIN_CAPTURE_S } from "../constants.ts";
import { sessionTokenMetadata } from "../../session-token.ts";
import { openLoginModal } from "../login-modal.ts";

function isSignedIn(): boolean {
    const token = sessionStorage.getItem("dash_token") ?? "";
    return sessionTokenMetadata(token) !== null;
}

export function updateClipButtonVisibility(): void {
    btnClip.hidden = ctx.transportKind !== "ws" || bufferedEnd() - bufferedStart() < CLIP_MIN_CAPTURE_S;
}

let clipButtonWired = false;

export function wireClipButton(): void {
    if (clipButtonWired) return;
    clipButtonWired = true;
    btnClip.addEventListener("click", () => {
        if (isSignedIn()) {
            window.open(`/clip/create?channel=${encodeURIComponent(ctx.username)}`, "_blank");
        } else {
            openLoginModal("clip");
        }
    });
}
