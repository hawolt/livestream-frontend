const VISIT_API = "/api/main/v1/visit";

export type VisitClass = "explore" | "channel" | "dashboard" | "other";

export function visitBody(cls: VisitClass): string {
    return JSON.stringify({ p: cls });
}

let reported = false;

export function reportVisit(cls: VisitClass): void {
    if (reported) return;
    reported = true;
    try {
        const body = visitBody(cls);
        if (typeof navigator.sendBeacon === "function"
                && navigator.sendBeacon(VISIT_API, new Blob([body], { type: "application/json" }))) {
            return;
        }
        void fetch(VISIT_API, {
            method: "POST",
            body,
            keepalive: true,
            headers: { "Content-Type": "application/json" },
        }).catch(() => {});
    } catch {}
}
