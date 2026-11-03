import type { AgentInfo, On, SessionRateLimit, SessionUsage, UiPane } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { activity, bgSpans, clock, dismissEnded, mergeAgents, parseNotification, prune } from '../hooks/activity'
import { MAX_AGE_MS, lineText } from '../hooks/hud'
import type { Span } from '../hooks/hud'

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0)
const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

type World = {
  rateLimits?: SessionRateLimit[]
  tokens?: number
  window?: number
  model?: string
  store?: Record<string, unknown>
  interactive?: boolean
  settings?: Record<string, unknown>
}

/** Stands up the engine beneath the plugin and returns what it observed. */
function world(on: On, w: World) {
  const clock = mock.clock(on, { now: NOW })
  const store = new Map<string, unknown>(Object.entries(w.store ?? {}))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  const state = {
    rateLimits: w.rateLimits ?? [],
    tokens: w.tokens as number | undefined,
    usageFails: false,
    statuses: [] as (string | undefined)[],
    agents: [] as AgentInfo[],
    panes: [] as UiPane[],
    opened: [] as string[],
    spawned: 0,
    // An open AskUserQuestion waits on this; the test answers it.
    answer: null as Promise<void> | null,
  }
  on('session.usage', () => {
    if (state.usageFails) throw new Error('usage unavailable')
    const value: SessionUsage = {
      startedAt: NOW,
      context: { window: w.window ?? 200_000, tokens: state.tokens },
      rateLimits: state.rateLimits,
    }
    return { value }
  })
  on('session.model', () => ({ value: w.model ?? 'Claude Sonnet 5' }))
  on('settings.read', () => ({ value: w.settings ?? {} }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('agent.list', () => ({ value: state.agents }))
  on('ui.panes', () => ({ value: state.panes }))
  // The terminal places a pane opened unasked only where it is wide enough;
  // here it always is.
  on('ui.open', ($, e) => {
    state.opened.push(e.id)
    if (!state.panes.some(p => p.id === e.id)) state.panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => {
    state.panes = state.panes.filter(p => p.id !== e.id)
    return { value: undefined }
  })
  // The line drawn under the prompt, as the plugin writes it to $.state.
  on('state.set', ($, e, next) => {
    if (e.key === 'line') state.statuses.push(lineText(e.value as Span[]))
    return next(e)
  })
  // The engine's hint line: one Text of the hint it was handed, its tail after it.
  on('ui.render', ($, e) => {
    const { hint, tail } = e.props as { hint: string; tail?: string }
    return h($.ui.resolve(e).Text, {}, tail ? `${hint} ${tail}` : hint) as never
  })
  on('session.start', () => ({ cwd: '/tmp' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.end', () => ({ sessionId: 's' }))
  // The engine beneath the background-work hooks.
  on('agent.spawn', () => ({ model: 'm', agentId: `a${++state.spawned}` }))
  on('tool.call', async ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      await state.answer
      return { result: { questions: [], answers: {} } as never }
    }
    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: (e as { bg?: string }).bg } as never }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('command.run', () => ({}))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  const last = () => state.statuses.at(-1)
  const stored = (k: 'five_hour' | 'seven_day') =>
    (store.get('shared') as { buckets: Record<string, { pct: number }> } | undefined)?.buckets[k]?.pct
  return { clock, state, last, store, stored }
}

const start = ($: Engine, interactive = true) =>
  $.session.start({ cwd: '/tmp', surface: interactive ? 'terminal' : null, isInteractive: interactive })

const both = (p5: number, pWk: number, r5 = NOW + 2 * H + 10 * 60_000, rWk = NOW + 76 * H): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed: p5, resetsAt: iso(r5) },
  { kind: 'seven_day', percentUsed: pWk, resetsAt: iso(rWk) },
]

describe('rendering', () => {
  test('full payload renders every segment', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    expect(w.last()).toBe('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K')
  })

  test('no reading and no store renders N/A, context still known', async ($, on) => {
    const w = world(on, {})
    await start($)
    expect(w.last()).toBe('Claude Sonnet 5   5h –   Wk –   Ctx 0/200K')
  })

  test('long model name is cut to 20 characters', async ($, on) => {
    const w = world(on, { model: 'An Extremely Long Model Name Indeed' })
    await start($)
    expect(w.last()?.startsWith('An Extremely Long Mo   5h')).toBe(true)
  })

  test('percentages outside 0..100 are clamped; other kinds are ignored', async ($, on) => {
    const w = world(on, {
      rateLimits: [
        { kind: 'five_hour', percentUsed: 140, resetsAt: iso(NOW + H) },
        { kind: 'seven_day', percentUsed: -5, resetsAt: iso(NOW + 30 * 60_000) },
        { kind: 'spend_limit', percentUsed: 50 },
      ],
    })
    await start($)
    expect(w.last()).toContain('5h 100%! · 1h00m   Wk 0%   Ctx')
  })

  test('non-interactive session draws nothing', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($, false)
    expect(w.state.statuses).toHaveLength(0)
  })

  test('a failing usage read keeps the previous line', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    const before = w.last()
    w.state.usageFails = true
    await w.clock.advance(5000)
    expect(w.last()).toBe(before)
  })
})

const HINT = {
  plugin: 'usage-hud',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: 'auto mode on (shift+tab to cycle)' },
} as const

describe('under the prompt', () => {
  test('idle, draws the line in place of the engine hint text, on every surface that has it', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const ui = await $.ui.mount({ ...HINT, surface: 'terminal' } as never)
    const text = await ui.find({ type: 'Text' })
    expect(text?.text).toBe('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K')
    await ui.unmount()
    // The desktop draws the labels as icons, in the same places, and every value.
    const desk = await $.ui.mount({ ...HINT, surface: 'desktop' } as never)
    const icons = await desk.findAll({ type: 'Svg' })
    expect(icons.map(i => i.props.alt)).toEqual(['5-hour usage', 'weekly usage', 'context window'])
    const runs = (await desk.findAll({ type: 'Text' })).map(t => t.text?.replace(/\u00a0/g, ' '))
    expect(runs).toEqual(['Claude Sonnet 5', '   ', ' ', '45%', ' · ', '2h10m', '   ', ' ', '23%', '   ', ' ', '156K/200K'])
    await desk.unmount()
  })

  test('the desktop keeps the text labels off its line and its spaces non-breaking', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const ui = await $.ui.mount({ ...HINT, surface: 'desktop' } as never)
    const runs = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
    expect(runs.some(t => /^(5h|Wk|Ctx)$/.test(t))).toBe(false)
    expect(runs.some(t => t.includes(' '))).toBe(false)
    await ui.unmount()
  })

  test('mid-turn on the desktop, the icon row goes under the engine hint', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const props = { ...HINT.props, isWorking: true, hint: 'esc to interrupt' }
    const ui = await $.ui.mount({ ...HINT, props, surface: 'desktop' } as never)
    expect((await ui.findAll({ type: 'Text' }))[0]?.text).toBe('esc to interrupt')
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(3)
    await ui.unmount()
  })

  test('desktopLabels text: the desktop draws the terminal\'s labels, the terminal unchanged', { options: { desktopLabels: 'text' } }, async ($, on) => {
    world(on, { rateLimits: both(93, 23), tokens: 156_000 })
    await start($)
    const desk = await $.ui.mount({ ...HINT, surface: 'desktop' } as never)
    expect(await desk.findAll({ type: 'Svg' })).toHaveLength(0)
    const runs = await desk.findAll({ type: 'Text' })
    expect(runs.map(t => t.text?.replace(/\u00a0/g, ' ')).join('')).toBe('Claude Sonnet 5   5h 93%! · 2h10m   Wk 23%   Ctx 156K/200K')
    expect(runs.some(t => t.text?.includes(' '))).toBe(false)
    const by = (t: string) => runs.find(r => r.text === t)?.props
    expect(by('5h')).toMatchObject({ dimColor: true })
    expect(by('23%')).toMatchObject({ color: 'suggestion' })
    expect(by('93%!')).toMatchObject({ color: 'error' })
    await desk.unmount()
    const term = await $.ui.mount({ ...HINT, surface: 'terminal' } as never)
    expect((await term.find({ type: 'Text' }))?.text).toBe('Claude Sonnet 5   5h 93%! · 2h10m   Wk 23%   Ctx 156K/200K')
    await term.unmount()
  })

  test('labels are dim, values colored, a warned value in the warning color', async ($, on) => {
    world(on, { rateLimits: both(93, 23), tokens: 156_000 })
    await start($)
    const ui = await $.ui.mount({ ...HINT, surface: 'terminal' } as never)
    const runs = await ui.findAll({ type: 'Text' })
    const by = (t: string) => runs.find(r => r.text === t)?.props
    expect(by('5h')).toMatchObject({ dimColor: true })
    expect(by('23%')).toMatchObject({ color: 'suggestion' })
    expect(by('93%!')).toMatchObject({ color: 'error' })
    await ui.unmount()
  })

  test('the engine hint alone before the first look', async ($, on) => {
    world(on, { rateLimits: both(45, 23) })
    const ui = await $.ui.mount({ ...HINT, surface: 'terminal' } as never)
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual([HINT.props.hint])
    await ui.unmount()
  })

  test('idle with background agents, the engine hint keeps its row and ours goes under it', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const props = { ...HINT.props, hint: '(shift+tab to cycle) · ← for agents · ↓ to manage' }
    const ui = await $.ui.mount({ ...HINT, props, surface: 'terminal' } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts[0]).toBe('(shift+tab to cycle) · ← for agents · ↓ to manage')
    expect(texts).toContain('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K')
    await ui.unmount()
  })

  test('idle, only the stock hint gives way to the line', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    for (const hint of ['? for shortcuts', '(shift+tab to cycle)', 'accept edits on (shift+tab to cycle)', '(shift+tab to cycle) · ← for agents', '']) {
      const ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, hint }, surface: 'terminal' } as never)
      expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).not.toContain(hint || '?')
      await ui.unmount()
    }
  })

  test('while a turn runs, the engine hint keeps its row and ours goes under it', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const props = { ...HINT.props, isWorking: true, hint: 'esc to interrupt' }
    const ui = await $.ui.mount({ ...HINT, props, surface: 'terminal' } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts[0]).toBe('esc to interrupt')
    expect(texts).toContain('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K')
    await ui.unmount()
  })
})

describe("other mods' tail", () => {
  const LINE = 'Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K'
  const TAIL = 'agents 1 0:12 · backup ok'

  test('idle, the tail ends our line, dim', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, tail: TAIL }, surface: 'terminal' } as never)
    expect((await ui.find({ type: 'Text' }))?.text).toBe(`${LINE}   ${TAIL}`)
    expect((await ui.findAll({ type: 'Text' })).find(t => t.text === TAIL)?.props).toMatchObject({ dimColor: true })
    await ui.unmount()
    const desk = await $.ui.mount({ ...HINT, props: { ...HINT.props, tail: TAIL }, surface: 'desktop' } as never)
    const runs = (await desk.findAll({ type: 'Text' })).map(t => t.text ?? '')
    expect(runs.at(-1)).toBe(TAIL.replace(/ /g, '\u00a0'))
    await desk.unmount()
  })

  test('while a turn runs, the tail rides our row, not the engine line', async ($, on) => {
    world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    const props = { ...HINT.props, isWorking: true, hint: 'esc to interrupt', tail: TAIL }
    const ui = await $.ui.mount({ ...HINT, props, surface: 'terminal' } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts[0]).toBe('esc to interrupt')
    expect(texts).toContain(`${LINE}   ${TAIL}`)
    expect(texts.filter(t => t?.startsWith('esc to interrupt'))).toEqual(['esc to interrupt'])
    await ui.unmount()
  })

  test('before the first look, the engine draws the tail itself', async ($, on) => {
    world(on, { rateLimits: both(45, 23) })
    const ui = await $.ui.mount({ ...HINT, props: { ...HINT.props, tail: TAIL }, surface: 'terminal' } as never)
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toEqual([`${HINT.props.hint} ${TAIL}`])
    await ui.unmount()
  })
})

describe('refresh', () => {
  test('the timer refreshes countdowns and new readings', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    w.state.rateLimits = both(46.5, 23)
    await w.clock.advance(60_000)
    expect(w.last()).toContain('5h 47% · 2h09m')
  })

  test('session.measure refreshes at once', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 1000 })
    await start($)
    w.state.tokens = 50_000
    await $.session.measure({ context: { window: 200_000, tokens: 50_000 }, rateLimits: [], changed: ['context'] })
    expect(w.last()).toContain('Ctx 50K/200K')
  })

  test('session.end stops the timer', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    await $.session.end({ reason: 'other' } as never)
    const n = w.state.statuses.length
    await w.clock.advance(30_000)
    expect(w.state.statuses).toHaveLength(n)
  })
})

describe('shared store', () => {
  const shared = (p5: number, pWk: number, savedAt = NOW, r5 = NOW + 2 * H, rWk = NOW + 76 * H) => ({
    shared: {
      savedAt,
      buckets: { five_hour: { pct: p5, resetsAt: r5 }, seven_day: { pct: pWk, resetsAt: rWk } },
    },
  })

  test('cold start shows the stored figures', async ($, on) => {
    const w = world(on, { store: shared(61, 30) })
    await start($)
    expect(w.last()).toContain('5h 61% · 2h00m   Wk 30%   Ctx')
  })

  test('a stored window that already reset shows 0.0% without a countdown', async ($, on) => {
    const w = world(on, { store: shared(61, 30, NOW, NOW - 60_000) })
    await start($)
    expect(w.last()).toContain('5h 0%   Wk 30%')
  })

  test('a store older than 7 days is ignored', async ($, on) => {
    const w = world(on, { store: shared(61, 30, NOW - MAX_AGE_MS - 1) })
    await start($)
    expect(w.last()).toContain('5h –   Wk –')
  })

  test('a malformed store is ignored', async ($, on) => {
    const w = world(on, { store: { shared: [1, 2, 3] } })
    await start($)
    expect(w.last()).toContain('5h –   Wk –')
  })

  test('a fresh reading is stored', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    expect(w.stored('five_hour')).toBe(45)
  })

  test('a fresh lower reading in the same window lowers the store', async ($, on) => {
    const w = world(on, { rateLimits: both(5, 23, NOW + 2 * H), store: shared(35, 23) })
    await start($)
    expect(w.last()).toContain('5h 5% · ')
    expect(w.stored('five_hour')).toBe(5)
  })

  test('an idle replay shows what another session stored, and never overwrites it', async ($, on) => {
    const w = world(on, { rateLimits: both(76, 23, NOW + 2 * H) })
    await start($)
    // Another session got a newer response and wrote it.
    w.store.set('shared', shared(91, 24).shared)
    await w.clock.advance(5000)
    expect(w.last()).toContain('5h 91%!')
    expect(w.stored('five_hour')).toBe(91)
  })

  test('a live window that has ended never replaces a current stored one', async ($, on) => {
    const w = world(on, { rateLimits: both(80, 23, NOW - 60_000), store: shared(12, 23, NOW, NOW + 4 * H) })
    await start($)
    expect(w.last()).toContain('5h 12% · 4h00m')
  })

  test('a reading carrying one window keeps the other from the store', async ($, on) => {
    const w = world(on, {
      rateLimits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: iso(NOW + H) }],
      store: shared(30, 55),
    })
    await start($)
    expect(w.last()).toContain('5h 40% · 1h00m   Wk 55%')
    expect(w.stored('seven_day')).toBe(55)
  })
})

describe('hot reload', () => {
  test('a replay after reload is still a replay: it shows and keeps the newer shared value', async ($, on) => {
    const live = both(76, 23, NOW + 2 * H)
    const w = world(on, {
      rateLimits: live,
      store: {
        shared: {
          savedAt: NOW,
          buckets: {
            five_hour: { pct: 91, resetsAt: NOW + 2 * H },
            seven_day: { pct: 23, resetsAt: NOW + 76 * H },
          },
        },
      },
    })
    // What the module saw before the reload, held by the host across it: the
    // first read answers it, later reads go to the host as usual.
    let seeded = false
    on('state.get', ($, e, next) => {
      if (seeded || e.key !== 'lastLive') return next(e)
      seeded = true
      const value = { five_hour: { pct: 76, resetsAt: NOW + 2 * H }, seven_day: { pct: 23, resetsAt: NOW + 76 * H } }
      return { value: { value, version: 1 } }
    })
    await start($)
    expect(w.last()).toContain('5h 91%!')
    expect(w.stored('five_hour')).toBe(91)
  })
})

/** Sends one model request through the chain, as the engine's query loop does. */
async function step($: Engine, effort: string | undefined, agentId?: string) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'opus', effort: effort as never, messageCount: 1, ...(agentId && { agentId }) } as never)
  for await (const _ of stream) {
    // drain
  }
}

describe('model and effort', () => {
  test('effort shows once the main loop sends a request', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), model: 'Opus 5.5' })
    await start($)
    expect(w.last()?.startsWith('Opus 5.5   5h')).toBe(true)
    await step($, 'high')
    await w.clock.settle()
    expect(w.last()?.startsWith('Opus 5.5 · high   5h')).toBe(true)
  })

  test("a subagent's effort is not the session's", async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), model: 'Opus 5.5' })
    await start($)
    await step($, 'high')
    await step($, 'low', 'agent-1')
    await w.clock.settle()
    expect(w.last()?.startsWith('Opus 5.5 · high   5h')).toBe(true)
  })

  test('a model without effort drops it again', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), model: 'Haiku 4.5' })
    await start($)
    await step($, 'high')
    await step($, undefined)
    await w.clock.settle()
    expect(w.last()?.startsWith('Haiku 4.5   5h')).toBe(true)
  })
})

describe('effort before the first request', () => {
  test("the settings' effortLevel for the model stands in", async ($, on) => {
    const settings = { effortLevel: 'low', modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } }
    const w = world(on, { rateLimits: both(45, 23), model: 'claude-opus-5-5', settings })
    await start($)
    expect(w.last()?.startsWith('claude-opus-5-5 · medium   5h')).toBe(true)
  })

  test('the top-level effortLevel when the model has none of its own', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), model: 'Opus 5.5', settings: { effortLevel: 'high' } })
    await start($)
    expect(w.last()?.startsWith('Opus 5.5 · high   5h')).toBe(true)
  })

  test('the first request replaces the guess, a model without effort included', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), model: 'Opus 5.5', settings: { effortLevel: 'high' } })
    await start($)
    await step($, undefined)
    await w.clock.settle()
    expect(w.last()?.startsWith('Opus 5.5   5h')).toBe(true)
  })
})

describe('marks and units', () => {
  test('the ! mark follows the rounded figure: 89.4 is 89%, 89.6 is 90%!', async ($, on) => {
    const w = world(on, { rateLimits: both(89.4, 89.6) })
    await start($)
    expect(w.last()).toContain('5h 89% · 2h10m   Wk 90%!   Ctx')
  })

  test('the weekly window shows no reset time', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    expect(w.last()).not.toContain('3d04h')
  })

  test('a 1M window reads 1M, not 1000K', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000, window: 1_000_000 })
    await start($)
    expect(w.last()).toContain('Ctx 156K/1M')
  })
})

const agent = (id: string, status: AgentInfo['status'], description = 'scan hooks', type = 'Explore'): AgentInfo => ({ id, status, description, type })
const NOTE = (id: string, status: string, summary: string) =>
  `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_1</tool-use-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`

describe('activity: what it reads', () => {
  test('a task notification gives the id, the outcome and the exit code', async () => {
    expect(parseNotification(NOTE('b1', 'completed', 'Background command "npm test" completed (exit code 0)'))).toEqual({ id: 'b1', status: 'done', exit: 0 })
    expect(parseNotification(NOTE('b2', 'failed', 'Background command "x" failed with exit code 144'))).toEqual({ id: 'b2', status: 'failed', exit: 144 })
    expect(parseNotification(NOTE('b3', 'killed', 'Background command "x" was stopped'))).toEqual({ id: 'b3', status: 'killed', exit: null })
    expect(parseNotification('hello')).toBeNull()
  })

  test('elapsed time reads m:ss, then h:mm:ss', async () => {
    expect([clock(38_000), clock(252_000), clock(3_909_000)]).toEqual(['0:38', '4:12', '1:05:09'])
  })

  test('an agent first seen already ended is hidden; a new one is timed from now', async () => {
    const jobs = mergeAgents({}, [agent('a1', 'completed'), agent('a2', 'running')], NOW)
    expect(jobs.a1?.hidden).toBe(true)
    expect(jobs.a2).toMatchObject({ startedAt: NOW, status: 'running', hidden: false })
  })

  test('a finished row lingers 30 s; a failed one stays until dismissed', async () => {
    let jobs = mergeAgents({}, [agent('a1', 'running'), agent('a2', 'running')], NOW)
    jobs = mergeAgents(jobs, [agent('a1', 'completed'), agent('a2', 'failed')], NOW + 10_000)
    expect(prune(jobs, NOW + 39_000).a1?.hidden).toBe(false)
    const later = prune(jobs, NOW + 40_000)
    expect([later.a1?.hidden, later.a2?.hidden]).toEqual([true, false])
    expect(dismissEnded(later).a2?.hidden).toBe(true)
  })

  test('rows put running first, oldest first; the head counts and times them', async () => {
    let jobs = mergeAgents({}, [agent('a1', 'running', 'older')], NOW)
    jobs = mergeAgents(jobs, [agent('a1', 'running', 'older'), agent('a2', 'waiting', 'newer', 'Plan')], NOW + 60_000)
    const a = activity(jobs, 0, NOW + 252_000)
    expect(a.agents.map(r => `${r.mark} ${r.name} ${r.word} ${r.time}`)).toEqual(['> Explore  older running 4:12', '> Plan  newer waiting 3:12'])
    expect([a.running, a.longestMs]).toEqual([2, 252_000])
  })

  test('the Bg segment: count and longest time, ?N while asked, nothing when idle', async () => {
    const jobs = mergeAgents({}, [agent('a1', 'running')], NOW)
    expect(lineText(bgSpans(activity(jobs, 1, NOW + 252_000)))).toBe('Bg 1 · 4:12 ?1')
    expect(bgSpans(activity({}, 0, NOW))).toEqual([])
  })
})

const PANE_PROPS = { title: 'Background', isFocused: false, placement: 'dock', scroll: { bodyRows: 20, top: 0 }, view: {}, bodyColumns: 40 }
const paneTexts = async ($: Engine) => {
  const ui = await $.ui.mount({ plugin: 'usage-hud', surface: 'terminal', component: 'Pane', requestId: 'activity', props: PANE_PROPS } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  await ui.unmount()
  return texts
}
const hudLine = async ($: Engine, isFullscreen: boolean) => {
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 160, rows: 40, isFullscreen } } as never)
  const text = (await ui.find({ type: 'Text' }))?.text
  await ui.unmount()
  return text
}
const spawn = ($: Engine, description: string) =>
  $.agent.spawn({ tool_use_id: 't', prompt: 'p', description, subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'm', background: true } as never)

describe('activity: the pane and the Bg segment', () => {
  test('in a fullscreen terminal the first agent opens the pane, which counts and times it', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    await hudLine($, true)
    w.state.agents = [agent('a1', 'running')]
    await spawn($, 'scan hooks')
    expect(w.state.opened).toEqual(['activity'])
    await w.clock.advance(252_000)
    const texts = await paneTexts($)
    expect(texts.slice(0, 2)).toEqual(['1 running', 'longest 4:12'])
    expect(texts).toContain('Explore  scan hooks')
    // The pane is on screen, so the HUD leaves Bg out.
    expect(await hudLine($, true)).toMatch(/Ctx 156K\/200K$/)
  })

  test('outside fullscreen no pane opens unasked, and the HUD carries Bg instead', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    await hudLine($, false)
    await $.tool.call({ tool: 'Bash', command: 'npm test\necho done', run_in_background: true, bg: 'b1' } as never)
    expect(w.state.opened).toEqual([])
    await w.clock.advance(38_000)
    expect(await hudLine($, false)).toMatch(/Ctx 156K\/200K   Bg 1 · 0:38$/)
  })

  test('a shell ends on its notification, with its exit code; the next prompt clears the failure', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true, bg: 'b1' } as never)
    await $.tool.call({ tool: 'Bash', command: 'ls', bg: undefined } as never)
    await $.command.run({ command: 'hud', args: '', origin: { kind: 'composer' } } as never)
    await w.clock.advance(9_000)
    await $.prompt.submit({ text: NOTE('b1', 'failed', 'Background command "npm test" failed with exit code 1'), wait: false, origin: { kind: 'task-notification' } } as never)
    let texts = await paneTexts($)
    expect(texts.slice(0, 1)).toEqual(['0 running'])
    expect(texts).toEqual(expect.arrayContaining(['x', 'npm test', 'exit 1', ' 0:09']))
    expect(texts).not.toContain('ls')
    await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } } as never)
    texts = await paneTexts($)
    expect(texts).not.toContain('npm test')
    expect(texts).toContain('nothing in the background')
  })

  test('an open question shows as ?1 and on the pane until it is answered', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    let answer: () => void = () => {}
    w.state.answer = new Promise(r => { answer = r })
    await start($)
    await hudLine($, false)
    const asked = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await w.clock.advance(1000)
    expect(await hudLine($, false)).toBe('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K   Bg 0 ?1')
    answer()
    await asked
    await w.clock.advance(1000)
    expect(await hudLine($, false)).toBe('Claude Sonnet 5   5h 45% · 2h10m   Wk 23%   Ctx 156K/200K')
  })

  test('/hud toggles the pane; once hidden, it is not opened unasked again', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23) })
    await start($)
    await hudLine($, true)
    const hud = () => $.command.run({ command: 'hud', args: '', origin: { kind: 'composer' } } as never)
    await hud()
    expect(w.state.panes.map(p => p.id)).toEqual(['activity'])
    await hud()
    expect(w.state.panes).toEqual([])
    w.state.agents = [agent('a1', 'running')]
    await spawn($, 'scan hooks')
    expect(w.state.opened).toEqual(['activity'])
    await hud()
    expect(w.state.opened).toEqual(['activity', 'activity'])
  })

  test('the clock ticks every second only while something runs', async ($, on) => {
    const w = world(on, { rateLimits: both(45, 23), tokens: 156_000 })
    await start($)
    await hudLine($, false)
    w.state.agents = [agent('a1', 'running')]
    await spawn($, 'scan hooks')
    await w.clock.advance(1000)
    expect(await hudLine($, false)).toContain('Bg 1 · 0:01')
    w.state.agents = [agent('a1', 'completed')]
    await w.clock.advance(1000)
    expect(await hudLine($, false)).not.toContain('Bg')
  })
})
