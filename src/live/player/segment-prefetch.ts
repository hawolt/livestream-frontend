import type { HlsConfig, Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext, LoaderResponse, LoaderStats } from "hls.js";

type LoaderConstructor = new (config: HlsConfig) => Loader<LoaderContext>;
type Result = { response: LoaderResponse; stats: LoaderStats; details: unknown };
type Entry = {
    loader: Loader<LoaderContext>;
    result?: Result;
    deliver?: (result: Result) => void;
    fail?: () => void;
};

export function prefetchURL(text: string, base: string): string | null {
    if (text.includes("#EXT-X-ENDLIST")) return null;
    const line = text.split(/\r?\n/).find((value) => value.startsWith("#EXT-X-PREFETCH:"));
    if (!line) return null;
    try {
        const url = new URL(line.slice("#EXT-X-PREFETCH:".length), base);
        return url.origin === new URL(base).origin ? url.href : null;
    } catch {
        return null;
    }
}

export function segmentPrefetchLoader(Base: LoaderConstructor) {
    const entries = new Map<string, Entry>();
    let lastHint: string | null = null;
    const clear = () => {
        for (const entry of entries.values()) entry.loader.destroy();
        entries.clear();
        lastHint = null;
    };
    class PrefetchLoader implements Loader<LoaderContext> {
        context: LoaderContext | null = null;
        private delegate: Loader<LoaderContext>;
        private attached: Entry | null = null;
        private stopped = false;
        constructor(private hlsConfig: HlsConfig) {
            this.delegate = new Base(hlsConfig);
        }
        get stats(): LoaderStats { return this.delegate.stats; }
        getCacheAge(): number | null { return this.delegate.getCacheAge?.() ?? null; }
        getResponseHeader(name: string): string | null { return this.delegate.getResponseHeader?.(name) ?? null; }
        abort(): void {
            this.stopped = true;
            if (this.attached) {
                this.attached.deliver = undefined;
                this.attached.fail = undefined;
            }
            this.delegate.abort();
        }
        destroy(): void {
            this.abort();
            this.delegate.destroy();
        }
        load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
            this.context = context;
            this.stopped = false;
            const cached = context.responseType === "arraybuffer" && !context.rangeStart && !context.rangeEnd
                ? entries.get(context.url) : undefined;
            if (cached) {
                entries.delete(context.url);
                this.delegate.destroy();
                this.delegate = cached.loader;
                this.attached = cached;
                const deliver = (result: Result) => {
                    if (!this.stopped) callbacks.onSuccess(result.response, result.stats, context, result.details);
                };
                cached.deliver = deliver;
                cached.fail = () => {
                    if (this.stopped) return;
                    this.attached = null;
                    this.delegate.destroy();
                    this.delegate = new Base(this.hlsConfig);
                    this.load(context, config, callbacks);
                };
                if (cached.result) queueMicrotask(() => deliver(cached.result!));
                return;
            }
            this.delegate.load(context, config, {
                ...callbacks,
                onSuccess: (response, stats, loadedContext, details) => {
                    if (this.stopped) return;
                    if (typeof response.data === "string") {
                        const url = prefetchURL(response.data, response.url || context.url);
                        if (url && url !== lastHint && !entries.has(url)) {
                            lastHint = url;
                            this.prefetch(url, config);
                        }
                    }
                    callbacks.onSuccess(response, stats, loadedContext, details);
                },
            });
        }
        private prefetch(url: string, config: LoaderConfiguration): void {
            while (entries.size >= 2) {
                const oldest = entries.keys().next().value!;
                entries.get(oldest)!.loader.destroy();
                entries.delete(oldest);
            }
            const entry: Entry = { loader: new Base(this.hlsConfig) };
            entries.set(url, entry);
            const fail = () => {
                if (lastHint === url) lastHint = null;
                if (entries.get(url) === entry) entries.delete(url);
                if (entry.fail) entry.fail();
                else entry.loader.destroy();
            };
            entry.loader.load({ url, responseType: "arraybuffer" }, config, {
                onSuccess: (response, stats, _context, details) => {
                    entry.result = { response, stats, details };
                    entry.deliver?.(entry.result);
                },
                onError: fail,
                onTimeout: fail,
            });
        }
    }
    return { loader: PrefetchLoader, clear };
}
