/**
 * task-done-notify — Host half (v2).
 *
 * Faces over one armed-set:
 *  1. /notify-when-done session command (composer slash menu);
 *  2. /api/task-done-notify RPC route for the Client bell button and settings page;
 *  3. `agent/turn-stopping` listener that pushes the notification and disarms.
 *
 * Channels (each independently enable-able, all optional):
 *  - serverchan: WeChat push via sctapi.ftqq.com, available when a SendKey is set;
 *  - dingtalk:   group custom-robot webhook, available when the URL is set;
 *  - dws:        DingTalk self-DM through the local `dws` CLI, available when that
 *                CLI is logged in (`dws contact user get-self` succeeds).
 *
 * Settings live in one credential record (`task-done-notify/settings`), never in
 * configuration, so secret values stay out of cordis.patch.yml. When the record
 * has no value for a secret, the legacy per-secret files under ~/.dsh/secrets are
 * used as a fallback.
 */
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join as joinPath } from 'node:path'

const CHANNEL = '/api/task-done-notify'
/** Credential record addressed by `<owner>/<id>`; the owner is this plugin's row id. */
const RECORD_KEY = 'task-done-notify/settings'
/** Sentinel a save payload uses to delete a stored secret. */
const CLEAR = '__CLEAR__'

const DEFAULTS = {
  serverchanKeyFile: '~/.dsh/secrets/serverchan-sendkey.txt',
  dingtalkWebhookFile: '~/.dsh/secrets/dingtalk-webhook.txt',
  dingtalkAtMobiles: [],
  dingtalkKeyword: '进度通知',
  enableServerchan: true,
  enableDingtalk: true,
  enableDws: false,
}

function expandHome(p) {
  if (!p) return p
  return p.startsWith('~') ? joinPath(homedir(), p.slice(1)) : p
}

function readTrimmed(file) {
  try {
    const v = readFileSync(expandHome(file), 'utf8').trim()
    return v.length > 0 ? v : ''
  } catch {
    return ''
  }
}

function nowLabel() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Show enough to recognize a secret without revealing it. */
function maskKey(v) {
  if (!v) return ''
  if (v.length <= 8) return `${v.slice(0, 2)}…`
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

function maskWebhook(v) {
  if (!v) return ''
  try {
    const u = new URL(v)
    return `${u.host}/…${maskKey(u.searchParams.get('access_token') || '')}`
  } catch {
    return maskKey(v)
  }
}

function parseMobiles(text) {
  return String(text || '')
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export const inject = ['commands']

export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  if (!Array.isArray(cfg.dingtalkAtMobiles)) cfg.dingtalkAtMobiles = []

  // sessionId 精确键；Client 拿不到 sessionId 时退化为 '*any'（一次性全局）。
  const armed = new Set()

  let selfIdentity = null

  // ---------- settings ----------

  async function readPayload() {
    const creds = ctx.get('credentials')
    if (!creds || typeof creds.readRecord !== 'function') return {}
    try {
      const rec = await creds.readRecord(RECORD_KEY)
      return rec && rec.payload && typeof rec.payload === 'object' ? rec.payload : {}
    } catch {
      return {}
    }
  }

  async function loadSettings() {
    const p = await readPayload()
    const ch = p.channels && typeof p.channels === 'object' ? p.channels : {}
    const pick = (a, b) => (typeof a === 'boolean' ? a : b)
    return {
      serverchanKey: (typeof p.serverchanKey === 'string' && p.serverchanKey) || readTrimmed(cfg.serverchanKeyFile),
      dingtalkWebhook: (typeof p.dingtalkWebhook === 'string' && p.dingtalkWebhook) || readTrimmed(cfg.dingtalkWebhookFile),
      atMobilesText: typeof p.atMobiles === 'string' ? p.atMobiles : cfg.dingtalkAtMobiles.join(','),
      keyword: (typeof p.keyword === 'string' && p.keyword) || cfg.dingtalkKeyword,
      channels: {
        serverchan: pick(ch.serverchan, cfg.enableServerchan),
        dingtalk: pick(ch.dingtalk, cfg.enableDingtalk),
        dws: pick(ch.dws, cfg.enableDws),
      },
    }
  }

  async function saveSettings(patch) {
    const creds = ctx.get('credentials')
    if (!creds || typeof creds.modifyRecord !== 'function') {
      throw new Error('凭据服务不可用，无法保存设置')
    }
    await creds.modifyRecord(RECORD_KEY, async (current) => {
      const prev = current && current.payload && typeof current.payload === 'object' ? current.payload : {}
      const next = { ...prev }
      if (patch.channels && typeof patch.channels === 'object') {
        next.channels = { ...(prev.channels || {}), ...patch.channels }
      }
      if (typeof patch.atMobiles === 'string') next.atMobiles = patch.atMobiles
      if (typeof patch.keyword === 'string' && patch.keyword.trim()) next.keyword = patch.keyword.trim()
      if (typeof patch.serverchanKey === 'string') {
        if (patch.serverchanKey === CLEAR) delete next.serverchanKey
        else if (patch.serverchanKey.trim()) next.serverchanKey = patch.serverchanKey.trim()
      }
      if (typeof patch.dingtalkWebhook === 'string') {
        if (patch.dingtalkWebhook === CLEAR) delete next.dingtalkWebhook
        else if (patch.dingtalkWebhook.trim()) next.dingtalkWebhook = patch.dingtalkWebhook.trim()
      }
      return { kind: 'grant', payload: next }
    })
  }

  // ---------- dws ----------

  // Desktop 是 GUI 进程，PATH 里未必有 Homebrew 目录，按候选顺序回退。
  const DWS_CANDIDATES = ['dws', '/opt/homebrew/bin/dws', '/usr/local/bin/dws', '~/.local/bin/dws']
  let dwsBin = null

  function runDwsOnce(bin, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env },
        (err, stdout, stderr) => {
          if (err) {
            err.stdout = stdout
            err.stderr = stderr
            reject(err)
            return
          }
          resolve({ stdout, stderr })
        },
      )
    })
  }

  async function runDws(args, timeoutMs = 25000) {
    if (dwsBin) return runDwsOnce(dwsBin, args, timeoutMs)
    let lastErr
    for (const candidate of DWS_CANDIDATES) {
      const bin = expandHome(candidate)
      try {
        const out = await runDwsOnce(bin, args, timeoutMs)
        dwsBin = bin
        return out
      } catch (err) {
        lastErr = err
        // 只对「找不到可执行文件」换下一个候选；命令本身失败说明二进制可用。
        if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) continue
        dwsBin = bin
        throw err
      }
    }
    throw lastErr || new Error('找不到 dws 可执行文件')
  }

  async function resolveSelf(force = false) {
    if (selfIdentity && !force) return selfIdentity
    const { stdout } = await runDws(['contact', 'user', 'get-self', '--format', 'json'], 15000)
    const data = JSON.parse(stdout)
    const emp = data?.result?.[0]?.orgEmployeeModel
    if (!emp?.userId) throw new Error('无法从 dws 读取登录身份')
    selfIdentity = { userId: emp.userId, name: emp.orgUserName || '' }
    return selfIdentity
  }

  async function dwsStatus() {
    try {
      const self = await resolveSelf()
      return { available: true, who: self.name }
    } catch (err) {
      selfIdentity = null
      const stderr = String(err?.stderr || '').trim()
      const msg = stderr || err?.message || String(err)
      return { available: false, who: '', error: msg.split('\n')[0].slice(0, 200) }
    }
  }

  // ---------- channels ----------

  async function postJson(url, init, label) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) })
      const text = await res.text().catch(() => '')
      let ok = res.ok
      let detail = `HTTP ${res.status}`
      try {
        const data = JSON.parse(text)
        if (data && typeof data.code !== 'undefined') {
          ok = res.ok && Number(data.code) === 0
          detail = `code ${data.code}${data.message ? ' ' + data.message : ''}`
        } else if (data && typeof data.errcode !== 'undefined') {
          ok = res.ok && Number(data.errcode) === 0
          detail = `errcode ${data.errcode}${data.errmsg ? ' ' + data.errmsg : ''}`
        } else if (data && data.ok === false) {
          ok = false
          detail = data.error?.message || 'ok=false'
        }
      } catch {
        if (!res.ok) detail = `HTTP ${res.status} ${text.slice(0, 120)}`
      }
      return { ok, detail: `${label}: ${detail}` }
    } catch (err) {
      return { ok: false, detail: `${label}: ${err && err.message ? err.message : String(err)}` }
    }
  }

  async function sendServerchan(s, title, body) {
    if (!s.serverchanKey) return { ok: false, detail: 'ServerChan: 未配置 SendKey，已跳过' }
    const form = new URLSearchParams()
    form.set('title', title)
    form.set('desp', body)
    return postJson(
      `https://sctapi.ftqq.com/${encodeURIComponent(s.serverchanKey)}.send`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
      'ServerChan',
    )
  }

  async function sendDingtalk(s, title, body) {
    if (!s.dingtalkWebhook) return { ok: false, detail: '钉钉群: 未配置 webhook，已跳过' }
    const content = `【${s.keyword}】${title}\n${body}`
    return postJson(
      s.dingtalkWebhook,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content },
          at: { mobiles: parseMobiles(s.atMobilesText), isAtAll: false },
        }),
      },
      '钉钉群',
    )
  }

  async function sendDws(s, title, body) {
    try {
      const self = await resolveSelf()
      const text = `${title}\n${body}`
      const { stdout } = await runDws(
        ['chat', '+messages-send', '--user', self.userId, '--text', text, '--yes', '--format', 'json'],
      )
      let detail = '已发送'
      let ok = true
      try {
        const d = JSON.parse(stdout)
        if (d && d.error) {
          ok = false
          detail = d.error.message || 'dws 返回错误'
        } else if (d && d.deliveryStatus) {
          detail = `已投递(${d.deliveryStatus})`
        }
      } catch {
        // 非 JSON 输出按退出码判定。
      }
      return { ok, detail: `钉钉(dws): ${detail}` }
    } catch (err) {
      selfIdentity = null
      const stderr = String(err?.stderr || '').trim().split('\n')[0]
      return { ok: false, detail: `钉钉(dws): ${stderr || err?.message || String(err)}` }
    }
  }

  function channelSenders() {
    return {
      serverchan: sendServerchan,
      dingtalk: sendDingtalk,
      dws: sendDws,
    }
  }

  async function pushDone(sessionLabel) {
    const s = await loadSettings()
    const title = '✅ DSH 任务完成'
    const body = `${sessionLabel}\n完成时间：${nowLabel()}`
    const senders = channelSenders()
    const tasks = []
    for (const [id, send] of Object.entries(senders)) {
      if (!s.channels[id]) continue
      tasks.push(send(s, title, body))
    }
    if (tasks.length === 0) return '没有启用任何通知方式'
    const settled = await Promise.allSettled(tasks)
    return settled
      .map((r) => (r.status === 'fulfilled' ? `${r.value.ok ? '✓' : '✗'} ${r.value.detail}` : `✗ ${r.reason}`))
      .join(' | ')
  }

  async function describeChannels() {
    const s = await loadSettings()
    const dws = await dwsStatus()
    return {
      channels: {
        serverchan: {
          enabled: s.channels.serverchan,
          configured: Boolean(s.serverchanKey),
          hint: maskKey(s.serverchanKey),
        },
        dingtalk: {
          enabled: s.channels.dingtalk,
          configured: Boolean(s.dingtalkWebhook),
          hint: maskWebhook(s.dingtalkWebhook),
        },
        dws: {
          enabled: s.channels.dws,
          available: dws.available,
          who: dws.who,
          error: dws.error || '',
        },
      },
      atMobiles: s.atMobilesText,
      keyword: s.keyword,
    }
  }

  // ---- 触发：turn 关闭 = 本轮任务完成 ----
  const offEvent = ctx.on('agent/turn-stopping', (...args) => {
    const payload = args[args.length - 1] || {}
    const agent = payload.agent
    const id = agent && agent.id
    if (!id) return
    let target
    if (armed.has(id)) {
      target = id
      armed.delete(id)
    } else if (armed.has('*any')) {
      target = '*any'
      armed.delete('*any')
    }
    if (!target) return
    const label = target === '*any' ? '任务已完成' : `会话 ${String(id).slice(0, 8)} 的任务已完成`
    void pushDone(label).then((r) => console.log(`[task-done-notify] ${r}`))
  })

  // ---- 命令面：/notify-when-done ----
  const unregister = ctx.commands.register({
    name: 'notify-when-done',
    description: '本轮任务完成后推送通知（微信/钉钉群/钉钉 dws）；再次执行可取消',
    input: { hint: '[on | off | status]' },
    handler: async ({ agent, rawInput }) => {
      const id = agent && agent.id
      if (!id) return { kind: 'error', text: '无法识别当前会话' }
      const arg = String(rawInput || '').trim().toLowerCase()
      if (arg === 'off') {
        armed.delete(id)
        armed.delete('*any')
        return { kind: 'success', text: '已关闭：本轮完成时不再推送通知' }
      }
      if (arg === 'status') {
        const on = armed.has(id) || armed.has('*any')
        if (!on) return { kind: 'success', text: '状态：未开启' }
        const st = await describeChannels()
        const names = []
        if (st.channels.serverchan.enabled) names.push(st.channels.serverchan.configured ? '微信(Server酱)' : '微信(缺 key)')
        if (st.channels.dingtalk.enabled) names.push(st.channels.dingtalk.configured ? '钉钉群' : '钉钉群(缺 webhook)')
        if (st.channels.dws.enabled) names.push(st.channels.dws.available ? '钉钉dws' : '钉钉dws(未登录)')
        return { kind: 'success', text: `状态：已开启 → ${names.join(' + ') || '无可用通道'}` }
      }
      if (armed.has(id) || armed.has('*any')) {
        armed.delete(id)
        armed.delete('*any')
        return { kind: 'success', text: '已取消：本轮完成时不再推送通知' }
      }
      armed.add(id)
      const st = await describeChannels()
      const names = []
      if (st.channels.serverchan.enabled) names.push(st.channels.serverchan.configured ? '微信(Server酱)' : '微信(缺 key)')
      if (st.channels.dingtalk.enabled) names.push(st.channels.dingtalk.configured ? '钉钉群' : '钉钉群(缺 webhook)')
      if (st.channels.dws.enabled) names.push(st.channels.dws.available ? '钉钉dws' : '钉钉dws(未登录)')
      return { kind: 'success', text: `已开启：本轮任务完成时推送 → ${names.join(' + ') || '无可用通道（请先在插件设置里配置）'}` }
    },
  })

  // ---- RPC：/api/task-done-notify ----
  const fail = (message, code = 'error', status = 400) =>
    Response.json({ ok: false, error: { code, message } }, { status })

  async function handleRpc(request) {
    let body
    try {
      body = await request.json()
    } catch {
      return fail('body is not JSON', 'bad-request')
    }
    const method = body?.method
    const payload = body?.payload || {}
    const sessionId =
      typeof payload?.sessionId === 'string' && payload.sessionId ? payload.sessionId : undefined

    try {
      switch (method) {
        case 'arm': {
          armed.add(sessionId || '*any')
          return Response.json({ ok: true, value: { armed: true, sessionId: sessionId || null } })
        }
        case 'disarm': {
          if (sessionId) armed.delete(sessionId)
          armed.delete('*any')
          return Response.json({ ok: true, value: { armed: false } })
        }
        case 'status': {
          return Response.json({ ok: true, value: { armed: sessionId ? armed.has(sessionId) : armed.size > 0 } })
        }
        case 'settings.get': {
          return Response.json({ ok: true, value: await describeChannels() })
        }
        case 'settings.save': {
          await saveSettings({
            channels: payload.channels,
            atMobiles: payload.atMobiles,
            keyword: payload.keyword,
            serverchanKey: payload.serverchanKey,
            dingtalkWebhook: payload.dingtalkWebhook,
          })
          return Response.json({ ok: true, value: await describeChannels() })
        }
        case 'channel.test': {
          const s = await loadSettings()
          const senders = channelSenders()
          const send = senders[payload.channel]
          if (!send) return fail(`未知通知方式 ${payload.channel ?? '(empty)'}`, 'unknown-channel')
          const result = await send(s, '🔔 这是一条测试通知', `来自 DSH 任务完成通知插件的测试\n发送时间：${nowLabel()}`)
          return Response.json({ ok: true, value: result })
        }
        default:
          return fail(`未知方法 ${method ?? '(empty)'}`, 'method-not-found', 404)
      }
    } catch (err) {
      return fail(err && err.message ? err.message : String(err), 'handler-failed', 500)
    }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['connection'], (connectionCtx) => {
      connectionCtx.effect(() => {
        let disposeRpc = null
        void connectionCtx.connection.fetch
          .register({
            path: CHANNEL,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: handleRpc,
          })
          .then((dispose) => {
            disposeRpc = dispose
          })
          .catch((error) => {
            console.log(`[task-done-notify] rpc register failed: ${error && error.message ? error.message : String(error)}`)
          })
        return () => {
          if (disposeRpc) void Promise.resolve(disposeRpc()).catch(() => {})
        }
      }, 'task-done-notify: rpc fetch route')
    })
  }

  return () => {
    if (typeof offEvent === 'function') offEvent()
    if (typeof unregister === 'function') unregister()
  }
}