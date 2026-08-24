export interface WeekClip {
    id: string;
    title: string;
    channel: string;
    creator: string;
    mature: boolean;
    views: number;
    score: number;
    myVote: number;
    createdAt: string | null;
    url: string;
    poster: string | null;
}

export interface WeekResponse {
    from: string;
    to: string;
    clips: WeekClip[];
}

export const PODIUM_SIZE = 3;

export function nextVote(current: number, clicked: 1 | -1): number {
    return current === clicked ? 0 : clicked;
}

export function optimisticScore(score: number, current: number, next: number): number {
    return score - current + next;
}

export function podium(clips: WeekClip[]): WeekClip[] {
    return clips.slice(0, PODIUM_SIZE);
}

export function remainder(clips: WeekClip[]): WeekClip[] {
    return clips.slice(PODIUM_SIZE);
}

export function rankLabel(index: number): string {
    return `#${index + 1}`;
}

export function scoreText(score: number): string {
    return score > 0 ? `+${score.toLocaleString()}` : score.toLocaleString();
}

export function viewsText(views: number): string {
    return views === 1 ? "1 view" : `${views.toLocaleString()} views`;
}

export function weekRangeText(from: string, to: string): string {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${fmt(start)} to ${fmt(end)}`;
}

export function byline(clip: WeekClip): string {
    if (!clip.creator || clip.creator === clip.channel) return clip.channel;
    return `${clip.channel}, clipped by ${clip.creator}`;
}
