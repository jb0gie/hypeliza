
/**
 * Guards any async task and tracks if something is running.
 * Used to prevent behavior execution during active message processing.
 */

export class MessageActivityGuard {
    private count = 0;

    isActive(): boolean {
        return this.count > 0;
    }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        this.count++;
        try {
        return await fn();
        } finally {
        this.count--;
        }
    }
}


export const msgGuard = new MessageActivityGuard();
  