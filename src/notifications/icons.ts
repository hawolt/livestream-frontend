const STROKE = `viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;

export const BELL_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;

export const CLOSE_ICON = `<svg ${STROKE}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const BADGE_ICON = `<svg ${STROKE}><circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>`;
const LIVE_ICON = `<svg ${STROKE}><path d="m10 8 6 4-6 4Z"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>`;
const FOLLOW_ICON = `<svg ${STROKE}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>`;
const RAID_ICON = `<svg ${STROKE}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>`;
const REDEEM_ICON = `<svg ${STROKE}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`;
const SYSTEM_ICON = `<svg ${STROKE}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

const ICONS: Record<string, string> = {
    badge: BADGE_ICON,
    live: LIVE_ICON,
    follow: FOLLOW_ICON,
    raid: RAID_ICON,
    redeem: REDEEM_ICON,
    system: SYSTEM_ICON,
};

export function notificationIcon(type: string): string {
    return ICONS[type] ?? SYSTEM_ICON;
}
