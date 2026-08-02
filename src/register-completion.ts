const COMPLETION_PARAM = "registration-complete";

export interface RegistrationCompletion {
    token: string;
    kind: string;
    state: string;
    replacement: string;
}

function relativeUrl(url: URL): string {
    return `${url.pathname}${url.search}${url.hash}`;
}

function withoutCompletionFields(hash: string): string {
    const names = ["token", "kind", "state"];
    return hash.slice(1)
        .split("&")
        .filter(part => {
            const parameter = new URLSearchParams(part);
            return !names.some(name => parameter.has(name));
        })
        .join("&");
}

export function registrationCompletionUrl(href: string, token: string, kind: string, state: string): string {
    const url = new URL(href);
    const existingFragment = withoutCompletionFields(url.hash);
    const completion = new URLSearchParams();
    url.searchParams.set(COMPLETION_PARAM, "1");
    completion.set("token", token);
    completion.set("kind", kind);
    completion.set("state", state);
    url.hash = [existingFragment, completion.toString()].filter(Boolean).join("&");
    return url.toString();
}

export function consumeRegistrationCompletion(href: string): RegistrationCompletion | null {
    const url = new URL(href);
    if (url.searchParams.get(COMPLETION_PARAM) !== "1") return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.getAll("token").find(value => value.length > 0) ?? "";
    const kind = fragment.get("kind") ?? "";
    const state = fragment.get("state") ?? "";
    url.searchParams.delete(COMPLETION_PARAM);
    url.hash = withoutCompletionFields(url.hash);
    return { token, kind, state, replacement: relativeUrl(url) };
}

export function isValidRegistrationCompletion(completion: RegistrationCompletion, expectedState: string): boolean {
    return expectedState.length > 0
        && completion.token.length > 0
        && completion.kind === "user"
        && completion.state === expectedState;
}
