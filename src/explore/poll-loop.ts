export interface PollLoopOptions<T> {
    request: (signal: AbortSignal) => Promise<T>;
    apply: (value: T) => void;
    onInitialError: () => void;
    schedule: (run: () => void, delayMs: number) => unknown;
    cancel: (handle: unknown) => void;
    pollDelayMs: number;
    retryDelayMs: number;
}

export interface PollLoop {
    start: () => void;
    stop: () => void;
}

interface ActiveRequest {
    controller: AbortController;
    generation: number;
}

export function createPollLoop<T>(options: PollLoopOptions<T>): PollLoop {
    let running = false;
    let generation = 0;
    let timer: unknown | null = null;
    let activeRequest: ActiveRequest | null = null;
    let immediatePending = false;
    let hasSucceeded = false;

    const clearTimer = (): void => {
        if (timer === null) return;
        options.cancel(timer);
        timer = null;
    };

    const scheduleNext = (delayMs: number, expectedGeneration: number): void => {
        clearTimer();
        timer = options.schedule(() => {
            timer = null;
            if (!running || generation !== expectedGeneration) return;
            runNow();
        }, delayMs);
    };

    const finish = (request: ActiveRequest, delayMs: number): void => {
        if (activeRequest === request) activeRequest = null;
        if (!running) return;
        if (generation !== request.generation || immediatePending) {
            immediatePending = false;
            runNow();
            return;
        }
        scheduleNext(delayMs, request.generation);
    };

    const execute = async (request: ActiveRequest): Promise<void> => {
        let delayMs = options.pollDelayMs;
        try {
            const value = await options.request(request.controller.signal);
            if (!running || generation !== request.generation) return;
            options.apply(value);
            hasSucceeded = true;
        } catch {
            if (!running || generation !== request.generation) return;
            delayMs = options.retryDelayMs;
            if (!hasSucceeded) options.onInitialError();
        } finally {
            finish(request, delayMs);
        }
    };

    function runNow(): void {
        if (!running) return;
        clearTimer();
        if (activeRequest !== null) {
            immediatePending = true;
            return;
        }
        immediatePending = false;
        const request = {
            controller: new AbortController(),
            generation,
        };
        activeRequest = request;
        void execute(request);
    }

    return {
        start(): void {
            if (running) return;
            running = true;
            generation += 1;
            immediatePending = true;
            runNow();
        },
        stop(): void {
            running = false;
            generation += 1;
            immediatePending = false;
            clearTimer();
            activeRequest?.controller.abort();
        },
    };
}
