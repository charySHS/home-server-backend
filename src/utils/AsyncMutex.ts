export class AsyncMutex {
    private queue: Promise<void> = Promise.resolve();

    async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        let resolveNext!: () => void;

        const next = new Promise<void>(resolve => { resolveNext = resolve; });

        const previous = this.queue;
        this.queue = next;

        await previous;

        try { return await fn() }
        finally { resolveNext(); }
    }
}