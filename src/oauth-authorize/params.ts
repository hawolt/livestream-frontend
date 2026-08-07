export interface OAuthAuthorizeParams {
    clientId: string;
    redirectUri: string;
    responseType: string;
    scope: string;
    state: string;
}

const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/;
const MAX_STATE_CHARS = 512;

export const SCOPE_ORDER = ["identity", "api:read", "api:write"] as const;

export const SCOPE_DESCRIPTIONS: Record<string, string> = {
    "identity": "Confirm who you are: your public username, user id and avatar. The app never sees your password or email.",
    "api:read": "Read your channel, followers and profile basics.",
    "api:write": "Update your stream title, category and language.",
};

export function normalizeScope(scope: string): string | null {
    const trimmed = scope.trim();
    if (!trimmed) return "identity";
    const requested = new Set<string>(["identity"]);
    for (const part of trimmed.split(/\s+/)) {
        if (!(SCOPE_ORDER as readonly string[]).includes(part)) return null;
        requested.add(part);
    }
    return SCOPE_ORDER.filter((known) => requested.has(known)).join(" ");
}

export function scopeList(scope: string): string[] {
    return scope.split(/\s+/).filter((part) => part.length > 0);
}

export function parseAuthorizeParams(search: string): OAuthAuthorizeParams | null {
    const params = new URLSearchParams(search);
    const clientId = params.get("client_id") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const responseType = params.get("response_type") ?? "";
    const scope = normalizeScope(params.get("scope") ?? "");
    const state = params.get("state") ?? "";
    if (!CLIENT_ID_PATTERN.test(clientId)) return null;
    if (!isValidRedirectUri(redirectUri)) return null;
    if (responseType !== "code") return null;
    if (scope === null) return null;
    if (state.length > MAX_STATE_CHARS) return null;
    return { clientId, redirectUri, responseType, scope, state };
}

export function isValidRedirectUri(redirectUri: string): boolean {
    if (!redirectUri) return false;
    try {
        const url = new URL(redirectUri);
        return (url.protocol === "http:" || url.protocol === "https:") && !url.hash;
    } catch {
        return false;
    }
}

export function buildDenyRedirect(redirectUri: string, state: string): string {
    const separator = redirectUri.includes("?") ? "&" : "?";
    const suffix = state ? `&state=${encodeURIComponent(state)}` : "";
    return `${redirectUri}${separator}error=access_denied${suffix}`;
}
