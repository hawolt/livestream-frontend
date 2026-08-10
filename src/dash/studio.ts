export function studioBaseUrl(): string {
    const baseDomain = location.hostname.replace(/^(live|admin|staff)\./, "");
    const port = location.port ? `:${location.port}` : "";
    return `https://studio.${baseDomain}${port}`;
}

export function studioTabUrl(tab: string): string {
    return `${studioBaseUrl()}/dashboard/${tab}`;
}
