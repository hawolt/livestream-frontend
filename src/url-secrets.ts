export interface ScrubbedUrlToken {
    token: string;
    replacement: string | null;
}

function relativeUrl(url: URL): string {
    return `${url.pathname}${url.search}${url.hash}`;
}

function withoutFragmentToken(hash: string): string {
    return hash.slice(1)
        .split("&")
        .filter(part => !new URLSearchParams(part).has("token"))
        .join("&");
}

export function scrubOneShotToken(href: string): ScrubbedUrlToken {
    const url = new URL(href);
    const fragmentParams = new URLSearchParams(url.hash.slice(1));
    const fragmentToken = fragmentParams.getAll("token").find(value => value.length > 0) ?? "";
    const queryToken = url.searchParams.getAll("token").find(value => value.length > 0) ?? "";
    const token = fragmentToken || queryToken;
    const hasFragmentToken = fragmentParams.has("token");
    const hasTokenParameter = hasFragmentToken || url.searchParams.has("token");
    if (!hasTokenParameter) return { token, replacement: null };
    url.searchParams.delete("token");
    if (hasFragmentToken) url.hash = withoutFragmentToken(url.hash);
    return { token, replacement: relativeUrl(url) };
}

export function scrubOverlayToken(href: string): ScrubbedUrlToken {
    const url = new URL(href);
    const rawFragment = url.hash.slice(1);
    const fragmentParams = new URLSearchParams(rawFragment);
    const fragmentToken = fragmentParams.getAll("token").find(value => value.length > 0) ?? "";
    const hasFragmentToken = fragmentToken.length > 0;
    const queryToken = url.searchParams.getAll("token").find(value => value.length > 0) ?? "";
    const token = hasFragmentToken ? fragmentToken : queryToken;

    if (!url.searchParams.has("token")) return { token, replacement: null };
    url.searchParams.delete("token");
    if (!hasFragmentToken && queryToken) {
        fragmentParams.set("token", queryToken);
        url.hash = fragmentParams.toString();
    }
    return { token, replacement: relativeUrl(url) };
}
