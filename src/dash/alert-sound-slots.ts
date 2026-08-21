export type AlertSoundSlot = "default" | "follow" | "raid" | "redeem";

export const SOUND_SLOTS: readonly AlertSoundSlot[] = ["default", "follow", "raid", "redeem"];

export interface SlotEndpoints {
    slot: AlertSoundSlot;
    upload: string;
    remove: string;
}

export function soundSlotEndpoints(): SlotEndpoints[] {
    return [
        { slot: "default", upload: "/api/profile/me/alert-sound", remove: "/api/profile/me/alert-sound" },
        { slot: "follow", upload: "/api/profile/me/alert-sound/follow", remove: "/api/profile/me/alert-sound/follow" },
        { slot: "raid", upload: "/api/profile/me/alert-sound/raid", remove: "/api/profile/me/alert-sound/raid" },
        { slot: "redeem", upload: "/api/profile/me/alert-sound/redeem", remove: "/api/profile/me/alert-sound/redeem" },
    ];
}
