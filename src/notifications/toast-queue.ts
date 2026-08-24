export const MAX_VISIBLE_TOASTS = 3;
export const TOAST_DISMISS_MS = 6000;

export interface ToastAdmission<T> {
    visible: T[];
    evicted: T[];
}

export interface ToastTimer {
    remainingMs: number;
    runningSince: number | null;
    holds: number;
}

export function admitToast<T>(visible: readonly T[], toast: T, cap: number = MAX_VISIBLE_TOASTS): ToastAdmission<T> {
    const limit = Math.max(1, Math.floor(cap));
    const next = [...visible, toast];
    const overflow = Math.max(0, next.length - limit);
    return {
        visible: next.slice(overflow),
        evicted: next.slice(0, overflow),
    };
}

export function dismissToast<T>(visible: readonly T[], toast: T): T[] {
    return visible.filter(entry => entry !== toast);
}

export function startToastTimer(now: number, durationMs: number = TOAST_DISMISS_MS): ToastTimer {
    return { remainingMs: Math.max(0, durationMs), runningSince: now, holds: 0 };
}

export function toastTimerRemaining(timer: ToastTimer, now: number): number {
    if (timer.runningSince === null) return timer.remainingMs;
    return Math.max(0, timer.remainingMs - (now - timer.runningSince));
}

export function toastTimerExpired(timer: ToastTimer, now: number): boolean {
    return timer.runningSince !== null && toastTimerRemaining(timer, now) <= 0;
}

export function holdToastTimer(timer: ToastTimer, now: number): ToastTimer {
    if (timer.holds > 0) return { ...timer, holds: timer.holds + 1 };
    return { remainingMs: toastTimerRemaining(timer, now), runningSince: null, holds: 1 };
}

export function releaseToastTimer(timer: ToastTimer, now: number): ToastTimer {
    if (timer.holds <= 1) return { remainingMs: timer.remainingMs, runningSince: now, holds: 0 };
    return { ...timer, holds: timer.holds - 1 };
}
