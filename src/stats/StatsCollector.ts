import os from "os";

const HISTORY_SIZE  = 60;   // 60 samples × 2 s = 2-min window
const INTERVAL_MS   = 2000;

export interface StatSample {
    ts:            number;  // epoch ms
    cpuPct:        number;  // 0–100
    memPct:        number;  // 0–100
    uploadBytes:   number;  // bytes received since last sample
    downloadBytes: number;  // bytes served since last sample
}

class StatsCollector {
    private history: StatSample[] = [];
    private prevCpus = os.cpus();
    private pendingUpload   = 0;
    private pendingDownload = 0;

    constructor() {
        // .unref() so the timer never prevents clean shutdown
        setInterval(() => this.collect(), INTERVAL_MS).unref();
    }

    trackUpload(bytes: number)   { this.pendingUpload   += bytes; }
    trackDownload(bytes: number) { this.pendingDownload += bytes; }

    private cpuPercent(): number {
        const curr = os.cpus();
        let idle = 0, total = 0;
        curr.forEach((cpu, i) => {
            const prev = this.prevCpus[i];
            if (!prev) return;
            for (const t of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
                const d = cpu.times[t] - prev.times[t];
                total += d;
                if (t === "idle") idle += d;
            }
        });
        this.prevCpus = curr;
        return total === 0 ? 0 : Math.round(100 - (100 * idle / total));
    }

    private collect() {
        const free = os.freemem();
        const tot  = os.totalmem();
        this.history.push({
            ts:            Date.now(),
            cpuPct:        this.cpuPercent(),
            memPct:        Math.round(((tot - free) / tot) * 100),
            uploadBytes:   this.pendingUpload,
            downloadBytes: this.pendingDownload,
        });
        this.pendingUpload = this.pendingDownload = 0;
        if (this.history.length > HISTORY_SIZE) this.history.shift();
    }

    getHistory(): StatSample[] { return this.history; }
}

export const statsCollector = new StatsCollector();
