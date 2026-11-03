/** One rate-limit window: percent used and when it resets (ms since the epoch). */
export type Bucket = { pct: number; resetsAt: number | null }
export type Buckets = { five_hour?: Bucket; seven_day?: Bucket }
/** Which segment a label names; each surface draws it as its own icon. */
export type Icon = 'five_hour' | 'seven_day' | 'context' | 'background'
/**
 * One run of the HUD line; `tone` says whether it names a segment or is a value.
 * A label carries `icon`, and its `text` is what the terminal shows for it.
 */
export type Span = { text: string; tone?: 'label' | 'data' | 'warn' | 'ask'; icon?: Icon }

/** Where a background job stands: an agent's loop status (`completed` as `done`), or a shell's. */
export type JobStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'done' | 'failed' | 'killed'
/** A subagent or a background shell, timed from when this session saw it start. */
export type Job = {
  kind: 'agent' | 'shell'
  /** An agent's task description, a shell's first command line. */
  name: string
  /** An agent's type (`Explore`); absent for a shell. */
  type?: string
  startedAt: number
  endedAt: number | null
  status: JobStatus
  /** A shell's exit code when its notification gave one. */
  exit: number | null
  /** Off the pane: lingered after ending, or seen by the person. */
  hidden: boolean
}
/** Jobs by id: an agent's `$.agent.list()` id, a shell's background task id. */
export type Jobs = Record<string, Job>

/** One drawn row of the pane: a mark and a word say its state, the tone only adds to them. */
export type Row = {
  id: string
  kind: Job['kind']
  mark: string
  name: string
  word: string
  tone: 'data' | 'ask' | 'error' | 'dim'
  time: string
  isFaded: boolean
}
/** What the pane and the HUD's `Bg` segment draw, recomputed each second while something runs. */
export type Activity = {
  /** Rows to show, agents then shells, each under way first (oldest first), then ended. */
  agents: Row[]
  shells: Row[]
  running: number
  /** The longest-running job's elapsed time, null with none running. */
  longestMs: number | null
  /** Open AskUserQuestion calls: Claude waits on the person. */
  asking: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-hud': {
      /** This session's own rate limits the last time it looked; survives hot reloads. */
      lastLive: Buckets | null
      /** The main loop's effort as its last model request carried it; null when the model takes none; unset before the first request. */
      effort: string | null
      /** The line drawn on the pills' row under the prompt, as tagged runs; null until the first look. */
      line: Span[] | null
      /** Background agents and shells this session has seen, by id. */
      jobs: Jobs
      /** AskUserQuestion calls now open. */
      asking: number
      /** The activity as last computed; null before the first look. */
      activity: Activity | null
      /** True while the activity pane is drawn and shown, so the HUD leaves out its `Bg` segment. */
      paneShown: boolean
      /** True once the person closed the pane; it is not opened unasked again this session. */
      paneOff: boolean
    }
  }
}
