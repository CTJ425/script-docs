import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { liveBuckets, nextShared, parseShared, renderSpans, sameBuckets, sameShared, settingsEffort } from './hud'
import type { Icon, Span, Tone } from './hud'
import type { Buckets } from '../types'

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

// Labels say what a segment is and stay dim; values carry the color, so the
// eye lands on the figures. Theme keys, so both follow the person's theme.
const TONE: Record<Tone, { color?: string; dimColor?: boolean }> = {
  label: { dimColor: true },
  data: { color: 'suggestion' },
  warn: { color: 'error' },
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
}
const ICON_PX = 12

let timer: Timer | null = null

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
  // The person's choice for the desktop's labels (userConfig `desktopLabels`):
  // its icons, or the terminal's text. The terminal always draws text.
  const desktopIcons = options.desktopLabels !== 'text'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (!e.isInteractive) return started
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => void refresh($))
    await refresh($)
    return started
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
  // row and ours goes under it.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await read($, LINE)
    if (line === null) return next(e)
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
    if (!e.props.isWorking) return hud
    const engine = await next(e)
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
    return next(e)
  })
}
