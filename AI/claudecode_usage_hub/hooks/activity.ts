import type { AgentInfo } from 'claude-code'

import { LABEL } from './hud'
import type { Activity, Job, JobStatus, Jobs, Row, Span } from '../types'

/**
 * Pure logic of the activity pane: which background work is running, for how
 * long, and how each row reads. No `$` here, so every rule is testable with
 * plain values. Times are milliseconds since the epoch ($.clock.now()).
 */

export type { Activity, Job, JobStatus, Jobs, Row }

// A row that ended well stays this long, dimmed, then leaves. One that failed
// stays until the person's next prompt: they have seen the pane by then.
export const LINGER_MS = 30_000

const ACTIVE: readonly JobStatus[] = ['pending', 'running', 'waiting']
export const isActive = (s: JobStatus) => ACTIVE.includes(s)
const isEnded = (s: JobStatus) => s === 'done' || s === 'failed' || s === 'killed'

/** An agent's loop status in the pane's words. */
export function agentStatus(s: AgentInfo['status']): JobStatus {
  return s === 'completed' ? 'done' : s
}

/**
 * Folds `$.agent.list()` into the jobs held. A new agent starts its clock now
 * unless `agent.spawn` already did; one first seen already ended (it finished
 * before this module loaded) is hidden, as nothing here timed it.
 */
export function mergeAgents(jobs: Jobs, agents: readonly AgentInfo[], now: number): Jobs {
  const out: Jobs = { ...jobs }
  for (const a of agents) {
    const status = agentStatus(a.status)
    const held = out[a.id]
    const name = a.description || a.type
    if (!held) {
      out[a.id] = { kind: 'agent', name, type: a.type, startedAt: now, endedAt: isEnded(status) ? now : null, status, exit: null, hidden: isEnded(status) }
      continue
    }
    // A message may resume an ended agent under the same id: its clock goes on.
    const endedAt = isEnded(status) ? (held.endedAt ?? now) : null
    if (held.status !== status || held.endedAt !== endedAt || held.name !== name) {
      out[a.id] = { ...held, name, type: a.type, status, endedAt, hidden: held.hidden && isEnded(status) }
    }
  }
  return out
}

/** Hides what ended well and has lingered long enough. */
export function prune(jobs: Jobs, now: number): Jobs {
  let changed = false
  const out: Jobs = {}
  for (const [id, j] of Object.entries(jobs)) {
    if (!j.hidden && j.status === 'done' && j.endedAt !== null && now - j.endedAt >= LINGER_MS) {
      out[id] = { ...j, hidden: true }
      changed = true
    } else out[id] = j
  }
  return changed ? out : jobs
}

/** Hides every ended row: the person's next prompt says they have seen them. */
export function dismissEnded(jobs: Jobs): Jobs {
  let changed = false
  const out: Jobs = {}
  for (const [id, j] of Object.entries(jobs)) {
    if (!j.hidden && isEnded(j.status)) {
      out[id] = { ...j, hidden: true }
      changed = true
    } else out[id] = j
  }
  return changed ? out : jobs
}

/** The first line of a shell command, as its row names it. */
export const commandName = (command: string) => command.split('\n')[0]?.trim() || command.trim()

export type Notification = { id: string; status: JobStatus; exit: number | null }

/**
 * Reads a background task's `<task-notification>` (`<task-id>`, `<status>`,
 * and the summary's `exit code N`); null for any other text.
 */
export function parseNotification(text: string): Notification | null {
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1]?.trim()
  const word = /<status>([^<]+)<\/status>/.exec(text)?.[1]?.trim()
  if (!id || !word) return null
  const code = /exit code (-?\d+)/.exec(text)?.[1]
  const exit = code === undefined ? null : Number(code)
  const status: JobStatus = word === 'completed' ? (exit !== null && exit !== 0 ? 'failed' : 'done') : word === 'killed' ? 'killed' : 'failed'
  return { id, status, exit }
}

/** `0:38`, `4:12`, `1:05:09`: minutes and seconds, hours once past one. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/**
 * How a row's state reads: a mark and a word, never color alone. The marks
 * are ASCII for the reason the HUD's labels are (see LABEL in hud.ts).
 */
function rowOf(id: string, j: Job, now: number): Row {
  const time = clock((j.endedAt ?? now) - j.startedAt)
  const name = j.type ? `${j.type}  ${j.name}` : j.name
  const base = { id, kind: j.kind, name, time, isFaded: false }
  switch (j.status) {
    case 'done':
      return { ...base, mark: '+', word: j.kind === 'shell' ? `exit ${j.exit ?? 0}` : 'done', tone: 'dim', isFaded: true }
    case 'failed':
      return { ...base, mark: 'x', word: j.exit !== null ? `exit ${j.exit}` : 'failed', tone: 'error' }
    case 'killed':
      return { ...base, mark: 'x', word: 'killed', tone: 'error' }
    case 'idle':
      return { ...base, mark: '-', word: 'idle', tone: 'dim' }
    default:
      // pending, running, waiting: all still under way.
      return { ...base, mark: '>', word: j.status, tone: 'data' }
  }
}

export function activity(jobs: Jobs, asking: number, now: number): Activity {
  const shown = Object.entries(jobs).filter(([, j]) => !j.hidden)
  const order = ([, a]: [string, Job], [, b]: [string, Job]) => {
    const ra = isActive(a.status) ? 0 : 1
    const rb = isActive(b.status) ? 0 : 1
    return ra - rb || a.startedAt - b.startedAt
  }
  const active = shown.filter(([, j]) => isActive(j.status))
  const longest = active.reduce<number | null>((m, [, j]) => Math.max(m ?? 0, now - j.startedAt), null)
  const rows = (kind: Job['kind']) => shown.filter(([, j]) => j.kind === kind).sort(order).map(([id, j]) => rowOf(id, j, now))
  return { agents: rows('agent'), shells: rows('shell'), running: active.length, longestMs: longest, asking }
}

/** The pane's head: what is running and for how long, the figure it exists for. */
export function headline(a: Activity): { title: string; detail: string | null } {
  const title = `${a.running} running`
  if (a.longestMs !== null) return { title, detail: `longest ${clock(a.longestMs)}` }
  const ended = a.agents.length + a.shells.length
  return { title, detail: ended > 0 ? null : 'nothing in the background' }
}

/**
 * The HUD's `Bg` segment, for when the pane is not on screen:
 * `Bg 3 · 4:12`, then `?1` while Claude waits on an answer. Empty when
 * nothing runs and nothing is asked.
 */
export function bgSpans(a: Activity): Span[] {
  if (a.running === 0 && a.asking === 0) return []
  const out: Span[] = [{ text: LABEL.background, tone: 'label', icon: 'background' }, { text: ' ' }]
  out.push({ text: a.longestMs === null ? `${a.running}` : `${a.running} · ${clock(a.longestMs)}`, tone: 'data' })
  if (a.asking > 0) out.push({ text: ' ' }, { text: `?${a.asking}`, tone: 'ask' })
  return out
}
