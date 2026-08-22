export interface FollowResponseLike {
    ok: boolean;
    status: number;
    bodyText: string;
}

export type FollowIntent =
    | { kind: "follow" }
    | { kind: "unfollow" }
    | { kind: "notify"; enabled: boolean };

export type FollowResult =
    | { kind: "follow"; following: boolean; notify: boolean }
    | { kind: "notify"; notify: boolean }
    | { kind: "login-required" }
    | { kind: "error" };

function parseBody(bodyText: string): Record<string, unknown> | null {
    const trimmed = bodyText.trim();
    if (trimmed === "") return null;
    try {
        const parsed = JSON.parse(trimmed);
        return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

export function resolveFollowResponse(response: FollowResponseLike, intent: FollowIntent): FollowResult {
    if (response.status === 401) return { kind: "login-required" };
    if (!response.ok) return { kind: "error" };
    const body = parseBody(response.bodyText);
    if (intent.kind === "notify") {
        const notify = body && "notify" in body ? !!body.notify : intent.enabled;
        return { kind: "notify", notify };
    }
    const intendedFollowing = intent.kind === "follow";
    const following = body && "following" in body ? !!body.following : intendedFollowing;
    const notify = body && "notify" in body ? body.notify !== false : true;
    return { kind: "follow", following, notify };
}
