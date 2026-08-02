export interface ScrubbedUrlToken {
    token: string;
    replacement: string | null;
}

function relativeUrl(url: URL): string {
    return `${url.pathname}${url.search}${url.hash}`;
}

export function scrubQueryToken(href: string): ScrubbedUrlToken {
    const url = new URL(href);
    const token = url.searchParams.getAll("token").find(value => value.length > 0) ?? "";
    if (!url.searchParams.has("token")) return { token, replacement: null };
    url.searchParams.delete("token");
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
