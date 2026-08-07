export interface OAuthAuthorizeParams {
    clientId: string;
    redirectUri: string;
    responseType: string;
    scope: string;
    state: string;
}

const CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/;
const MAX_STATE_CHARS = 512;

export function parseAuthorizeParams(search: string): OAuthAuthorizeParams | null {
    const params = new URLSearchParams(search);
    const clientId = params.get("client_id") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const responseType = params.get("response_type") ?? "";
    const scope = params.get("scope") ?? "identity";
    const state = params.get("state") ?? "";
    if (!CLIENT_ID_PATTERN.test(clientId)) return null;
    if (!isValidRedirectUri(redirectUri)) return null;
    if (responseType !== "code") return null;
    if (scope !== "identity") return null;
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
