/** One rate-limit window: percent used and when it resets (ms since the epoch). */
export type Bucket = { pct: number; resetsAt: number | null }
export type Buckets = { five_hour?: Bucket; seven_day?: Bucket }
/** Which segment a label names; each surface draws it as its own icon. */
export type Icon = 'five_hour' | 'seven_day' | 'context'
/**
 * One run of the HUD line; `tone` says whether it names a segment or is a value.
 * A label carries `icon`, and its `text` is the terminal's glyph for it.
 */
export type Span = { text: string; tone?: 'label' | 'data' | 'warn'; icon?: Icon }

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      /** This session's own rate limits the last time it looked; survives hot reloads. */
      lastLive: Buckets | null
      /** The main loop's effort as its last model request carried it; null when the model takes none; unset before the first request. */
      effort: string | null
      /** The line drawn on the pills' row under the prompt, as tagged runs; null until the first look. */
      line: Span[] | null
    }
  }
}
