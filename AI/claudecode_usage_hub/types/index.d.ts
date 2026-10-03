/** One rate-limit window: percent used and when it resets (ms since the epoch). */
export type Bucket = { pct: number; resetsAt: number | null }
export type Buckets = { five_hour?: Bucket; seven_day?: Bucket }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      /** This session's own rate limits the last time it looked; survives hot reloads. */
      lastLive: Buckets | null
      /** The main loop's effort as its last model request carried it; null when the model takes none. */
      effort: string | null
      /** The line the band above the prompt draws; null until the first look. */
      line: string | null
    }
  }
}
