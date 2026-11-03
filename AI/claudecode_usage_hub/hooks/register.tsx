import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { activity, bgSpans, commandName, dismissEnded, headline, mergeAgents, parseNotification, prune } from './activity'
import { SEP, isStockHint, liveBuckets, nextShared, parseShared, renderSpans, sameBuckets, sameShared, settingsEffort } from './hud'
import type { Icon, Span, Tone } from './hud'
import type { Buckets, Job, Jobs, Row } from '../types'

const STORE_KEY = 'shared'
// The engine pushes session.measure after each main-thread turn and when a
// window moves a whole point; the timer covers the rest (decimals, countdowns,
// usage another session wrote while this one is idle or waiting on a subagent).
const TICK_MS = 5000

// What this session's own rate limits were the last time it looked. They only
// change on an API response, so a change means the figure is fresh. Held in
// $.state, not a module variable, so a hot reload doesn't mistake an idle
// replay for a fresh reading.
const LAST_LIVE = { plugin: 'usage-hud', key: 'lastLive' } as const
// The effort the main loop's last model request carried; unset until the
// first one, when the settings' effortLevel for the model stands in.
const EFFORT = { plugin: 'usage-hud', key: 'effort' } as const
// The line drawn under the prompt, on the row of the engine's mode pills;
// null until the first look. Drawn there rather than with $.ui.status, which the engine
// shows as a pinned notice under its own `⚠ usage-hud:` prefix.
const LINE = atom({ plugin: 'usage-hud', key: 'line' } as const, null)

// Background work: the jobs seen, the questions open, and what the pane and
// the HUD's `Bg` segment draw from them. All in $.state, so a hot reload
// keeps every clock running.
const JOBS = atom({ plugin: 'usage-hud', key: 'jobs' } as const, {} as Jobs)
const ASKING = atom({ plugin: 'usage-hud', key: 'asking' } as const, 0)
const ACTIVITY = atom({ plugin: 'usage-hud', key: 'activity' } as const, null)
const PANE_SHOWN = atom({ plugin: 'usage-hud', key: 'paneShown' } as const, false)
const PANE_OFF = atom({ plugin: 'usage-hud', key: 'paneOff' } as const, false)
const PANE = 'activity'
const PANE_TITLE = 'Background'
const COMMAND = 'hud'
// While anything runs, its elapsed time moves every second; a 5-second step
// reads as a stall. Nothing running, the usage timer's 5 seconds is enough.
const LIVE_TICK_MS = 1000

// Labels say what a segment is and stay dim; values carry the color, so the
// eye lands on the figures. Theme keys, so both follow the person's theme.
const TONE: Record<Tone, { color?: string; dimColor?: boolean }> = {
  label: { dimColor: true },
  data: { color: 'suggestion' },
  warn: { color: 'error' },
  ask: { color: 'warning' },
}
const ROW_TONE: Record<Row['tone'], { color?: string; dimColor?: boolean }> = {
  data: { color: 'suggestion' },
  ask: { color: 'warning' },
  error: { color: 'error' },
  dim: { dimColor: true },
}

// The desktop draws each label as a 16-unit icon instead of the terminal's
// text. An Svg is an isolated image that cannot read the theme, so the
// stroke is a mid grey that holds up on light and dark alike, as dim as the
// labels it stands for. `alt` says what the icon names.
const STROKE = 'fill="none" stroke="#8a8a8a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`
const ICON: Record<Icon, { source: string; alt: string }> = {
  five_hour: {
    source: svg(`<circle cx="8" cy="8" r="6.25" ${STROKE}/><path d="M8 4.5V8l2.5 1.5" ${STROKE}/>`),
    alt: '5-hour usage',
  },
  seven_day: {
    source: svg(`<rect x="2" y="3" width="12" height="11" rx="1.5" ${STROKE}/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" ${STROKE}/>`),
    alt: 'weekly usage',
  },
  context: {
    source: svg(`<rect x="2" y="2.5" width="12" height="11" rx="1.5" ${STROKE}/><rect x="4" y="4.5" width="4" height="7" rx=".5" fill="#8a8a8a"/>`),
    alt: 'context window',
  },
  background: {
    source: svg(`<path d="M3 4.5h10M3 8h10M3 11.5h6" ${STROKE}/>`),
    alt: 'background work',
  },
}
const ICON_PX = 12

let timer: Timer | null = null
let liveTimer: Timer | null = null
// Whether the terminal docks a pane beside the transcript, as the prompt's
// hint line last measured it. A pane is opened unasked only where it would be
// a sidebar; elsewhere it would push the prompt down, and `Bg` says enough.
let isFullscreen: boolean | undefined

async function refresh($: EngineInterface) {
  try {
    const [usage, model, now, stored, held, effort] = await Promise.all([
      $.session.usage(),
      $.session.model(),
      $.clock.now(),
      $.store.get(STORE_KEY),
      $.state.get(LAST_LIVE),
      $.state.get(EFFORT),
    ])
    const lastLive: Buckets | null = held.value ?? null
    const live = liveBuckets(usage.rateLimits)
    const fresh = lastLive === null || !sameBuckets(lastLive, live)
    if (fresh && Object.keys(live).length > 0) await $.state.set(LAST_LIVE, live)

    const shown = effort.value !== undefined ? effort.value : settingsEffort(await $.settings.read(), model)
    const shared = parseShared(stored, now)
    const line = renderSpans(model, shown, live, shared, fresh, usage.context, now)
    await update($, LINE, () => line)

    const next = nextShared(live, shared, fresh, now)
    if (next && !sameShared(next, shared)) await $.store.set(STORE_KEY, next)
  } catch {
    // A failed look keeps the last line; never surface an error every tick.
  }
}

/**
 * Folds the agent list into the jobs, recomputes what the pane and `Bg` draw,
 * opens the pane the first time something runs, and keeps the 1-second timer
 * running exactly while something does.
 */
async function look($: EngineInterface) {
  try {
    const [now, agents] = await Promise.all([$.clock.now(), $.agent.list()])
    const jobs = await update($, JOBS, held => {
      const next = prune(mergeAgents(held, agents, now), now)
      return JSON.stringify(next) === JSON.stringify(held) ? held : next
    })
    const a = activity(jobs, await read($, ASKING), now)
    await update($, ACTIVITY, () => a)

    let pane = (await $.ui.panes()).find(p => p.id === PANE)
    if (!pane && a.running > 0 && isFullscreen === true && !(await read($, PANE_OFF))) {
      await $.ui.open({ id: PANE, title: PANE_TITLE })
      pane = (await $.ui.panes()).find(p => p.id === PANE)
    }
    const shown = pane !== undefined && pane.isPlaced && pane.isShown
    if ((await read($, PANE_SHOWN)) !== shown) await update($, PANE_SHOWN, () => shown)

    const isLive = a.running > 0 || a.asking > 0
    if (isLive && !liveTimer) liveTimer = $.clock.every(LIVE_TICK_MS, () => void look($))
    if (!isLive && liveTimer) {
      liveTimer.cancel()
      liveTimer = null
    }
  } catch {
    // Same as refresh: the pane keeps what it had.
  }
}

async function addJob($: EngineInterface, id: string, job: Job) {
  await update($, JOBS, held => ({ ...held, [id]: { ...job, startedAt: held[id]?.startedAt ?? job.startedAt } }))
  await look($)
}

async function noteEffort($: EngineInterface, effort: string | number | undefined) {
  try {
    const value = effort === undefined ? null : String(effort)
    const held = await $.state.get(EFFORT)
    // Unset and null differ: null is a model that takes none, which ends the guess.
    if (held.value === value) return
    await $.state.set(EFFORT, value)
    await refresh($)
  } catch {
    // Same as refresh: the line keeps what it had.
  }
}

export const register: Register = (on, options) => {
  timer = null
  liveTimer = null
  // The person's choice for the desktop's labels (userConfig `desktopLabels`):
  // its icons, or the terminal's text. The terminal always draws text.
  const desktopIcons = options.desktopLabels !== 'text'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    timer?.cancel()
    // The usage tick also looks at the agents, which catches any spawned
    // where no agent.spawn hook saw them start.
    timer = $.clock.every(TICK_MS, () => void Promise.all([refresh($), look($)]))
    await $.command.register({ name: COMMAND, description: 'Show or hide the background-work pane' }).catch(() => {})
    await Promise.all([refresh($), look($)])
    return started
  })

  // Times an agent from the moment it starts; the list only says it exists.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId !== undefined) {
      const now = await $.clock.now()
      await addJob($, spawned.agentId, { kind: 'agent', name: e.description || e.subagentType, type: e.subagentType, startedAt: now, endedAt: null, status: 'running', exit: null, hidden: false })
    }
    return spawned
  }).catch(($, e, next) => next(e))

  // A Bash call that comes back with a background task id goes on running:
  // run_in_background, ctrl+b, or a timeout that backgrounded it.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const id = ran.result && typeof ran.result === 'object' ? (ran.result as { backgroundTaskId?: unknown }).backgroundTaskId : undefined
    if (typeof id === 'string' && id) {
      const command = typeof (e as { command?: unknown }).command === 'string' ? (e as { command: string }).command : ''
      const now = await $.clock.now()
      await addJob($, id, { kind: 'shell', name: commandName(command) || id, startedAt: now, endedAt: null, status: 'running', exit: null, hidden: false })
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Claude waits on the person for as long as the question is open.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await update($, ASKING, n => n + 1)
    void look($)
    try {
      return await next(e)
    } finally {
      await update($, ASKING, n => Math.max(0, n - 1))
      void look($)
    }
  }).catch(($, e, next) => next(e))

  // A background shell reports its end as a task notification. The person's
  // own prompt says they have seen what ended, so those rows leave.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') {
      const done = parseNotification(e.text)
      if (done) {
        const now = await $.clock.now()
        await update($, JOBS, held => {
          const job = held[done.id]
          if (!job || job.kind !== 'shell') return held
          return { ...held, [done.id]: { ...job, status: done.status, exit: done.exit, endedAt: job.endedAt ?? now } }
        })
        void look($)
      }
    } else if (e.origin.kind === 'composer') {
      await update($, JOBS, dismissEnded)
      void look($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // `/hud` shows the pane, or hides it when it is up. Asked, it is placed at
  // any width; hidden by the person, it is not opened unasked again.
  on('command.run', { command: COMMAND }, async $ => {
    const up = (await $.ui.panes()).some(p => p.id === PANE)
    if (up) {
      await update($, PANE_OFF, () => true)
      await $.ui.close({ id: PANE })
      void look($)
      return { text: 'Background pane hidden.' }
    }
    await update($, PANE_OFF, () => false)
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    void look($)
    return { text: 'Background pane shown.' }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') await update($, PANE_OFF, () => true)
    if (e.id === PANE) void look($)
    return closed
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const a = await read($, ACTIVITY)
    if (a === null) return <Text dimColor>Looking…</Text>
    const head = headline(a)
    const row = (r: Row) => (
      <Box flexDirection="row" columnGap={1}>
        <Text {...ROW_TONE[r.tone]}>{r.mark}</Text>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end" dimColor={r.isFaded}>
            {r.name}
          </Text>
        </Box>
        <Text {...ROW_TONE[r.tone]}>{r.word}</Text>
        <Text dimColor>{r.time.padStart(5)}</Text>
      </Box>
    )
    const group = (name: string, rows: Row[]) =>
      rows.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>{name}</Text>
          {rows.map(row)}
        </Box>
      )
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{head.title}</Text>
          {head.detail !== null && <Text dimColor>{head.detail}</Text>}
          {a.asking > 0 && <Text color="warning">? Claude is asking you{a.asking > 1 ? ` (${a.asking})` : ''}</Text>}
        </Box>
        {group('Agents', a.agents)}
        {group('Shells', a.shells)}
      </Box>
    )
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // Observe only: the request goes on unchanged, and the effort is noted
  // beside it rather than ahead of it so the request is never held up.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) void noteEffort($, e.effort)
    return yield* next(e)
  })

  // The terminal draws the mode pills (`⏵⏵ auto mode on`) itself, ahead of
  // anything a hook returns, so no row can sit between them and the prompt.
  // Idle, our line takes the place of the engine's hint text on the pills'
  // row; while a turn runs, the engine's hint (`esc to interrupt`) keeps that
  // row and ours goes under it. Idle too, a line carrying more than its stock
  // hint (`1 local agent · ↓ to manage`) keeps its row.
  // Other mods put their segment on this row through the `tail` prop. Ours
  // draws it at its own end, three spaces after its last segment, and hands
  // the engine its line without it, so the tail shows once, on every surface
  // we draw.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface === 'terminal' && e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    const usage = await read($, LINE)
    if (usage === null) return next(e)
    // Without the pane on screen, the HUD answers its question itself.
    const a = await read($, ACTIVITY)
    const bg = a !== null && !(await read($, PANE_SHOWN)) ? bgSpans(a) : []
    const own = bg.length > 0 ? [...usage, SEP, ...bg] : usage
    const { tail, ...props } = e.props
    const line: Span[] = tail ? [...own, { text: '   ' }, { text: tail }] : own
    const { Box, Text } = $.ui.resolve(e)
    const tone = (s: Span) => (s.tone ? TONE[s.tone] : { dimColor: true })
    let hud
    if (e.surface === 'desktop') {
      // Icons in place of the labels unless the person chose the terminal's
      // text; each other run a Text. The page collapses a run's edge spaces,
      // so they go non-breaking.
      const { Svg } = $.ui.resolve(e)
      hud = (
        <Box flexDirection="row" alignItems="center">
          {line.map(s =>
            s.icon && desktopIcons ? (
              <Svg {...ICON[s.icon]} width={ICON_PX} height={ICON_PX} />
            ) : (
              <Text {...tone(s)}>{s.text.replace(/ /g, '\u00a0')}</Text>
            ),
          )}
        </Box>
      )
    } else {
      hud = (
        <Text wrap="truncate-end">
          {line.map(s => (
            <Text {...tone(s)}>{s.text}</Text>
          ))}
        </Text>
      )
    }
    if (!e.props.isWorking && isStockHint(e.props.hint)) return hud
    const engine = await next({ ...e, props })
    return (
      <Box flexDirection="column">
        {engine}
        {hud}
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    timer?.cancel()
    timer = null
    liveTimer?.cancel()
    liveTimer = null
    return next(e)
  })
}
