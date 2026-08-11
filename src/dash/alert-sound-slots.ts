export type AlertSoundSlot = "default" | "follow" | "raid";

export interface SlotEndpoints {
    slot: AlertSoundSlot;
    upload: string;
    remove: string;
    head: string;
}

export function soundSlotEndpoints(username: string): SlotEndpoints[] {
    const u = encodeURIComponent(username);
    return [
        { slot: "default", upload: "/api/profile/me/alert-sound", remove: "/api/profile/me/alert-sound", head: `/api/live/alert-sound/${u}` },
        { slot: "follow", upload: "/api/profile/me/alert-sound/follow", remove: "/api/profile/me/alert-sound/follow", head: `/api/live/alert-sound/${u}/follow` },
        { slot: "raid", upload: "/api/profile/me/alert-sound/raid", remove: "/api/profile/me/alert-sound/raid", head: `/api/live/alert-sound/${u}/raid` },
    ];
}

export function slotHasOwnSound(slot: AlertSoundSlot, ok: boolean, source: string | null): boolean {
    if (!ok) return false;
    if (slot === "default") return true;
    return source === "type";
}
