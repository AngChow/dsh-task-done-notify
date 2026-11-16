window.__ModuleLoader__.load({
  id: 'task-done-notify',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const CHANNEL = '/api/task-done-notify'

    // DeepSeek 发送按钮蓝：从客户端截图实测取色（rgb 66,120,234）。
    const BLUE = '#4278EA'

    async function rpc(method, payload) {
      const res = await fetch(CHANNEL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, payload: payload ?? null }),
      })
      const data = await res.json().catch(() => null)
      const result = data?.result ?? data
      if (!result) throw new Error('RPC 响应为空')
      if (!result.ok) throw new Error(result.error?.message ?? 'RPC 失败')
      return result.value
    }

    function sessionIdFrom(props) {
      if (!props) return undefined
      const candidates = [
        props.sessionId,
        props.agentId,
        props.session && props.session.id,
        props.agent && props.agent.id,
      ]
      for (const c of candidates) {
        if (typeof c === 'string' && c.length > 0) return c
      }
      return undefined
    }

    // ---------- 输入框铃铛 ----------

    function BellButton(props) {
      const [armed, setArmed] = React.useState(false)
      const [hint, setHint] = React.useState('')
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        let cancelled = false
        rpc('status', { sessionId: sessionIdFrom(props) })
          .then((v) => {
            if (!cancelled) setArmed(Boolean(v && v.armed))
          })
          .catch(() => {})
        return () => {
          cancelled = true
        }
      }, [props])

      async function toggle() {
        if (busy) return
        setBusy(true)
        setHint('')
        try {
          const method = armed ? 'disarm' : 'arm'
          const v = await rpc(method, { sessionId: sessionIdFrom(props) })
          setArmed(Boolean(v && v.armed))
        } catch (err) {
          setHint(`失败(${err && err.message ? err.message : err})`)
        } finally {
          setBusy(false)
        }
      }

      const label = armed ? '🔔 已设完成/等待通知' : '🔕 完成或需选择时通知我'
      const children = [label]
      if (hint) {
        children.push(h('span', { style: { marginLeft: 6, color: 'var(--dsw-alias-state-warn-primary)' } }, hint))
      }
      return h(
        'button',
        {
          type: 'button',
          title: '任务完成、或中途需要你选择/批准时推送通知（可在 设置 → 插件 → 任务完成通知 里配置通道）',
          'aria-pressed': armed ? 'true' : 'false',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            height: 24,
            padding: '0 8px',
            borderRadius: 6,
            border: '1px solid ' + (armed ? BLUE : 'var(--dsw-alias-border-l1)'),
            color: armed ? BLUE : 'var(--dsw-alias-label-secondary)',
            background: armed ? 'rgba(66, 120, 234, 0.08)' : 'transparent',
            fontSize: 12,
            lineHeight: 1,
            fontWeight: armed ? 500 : 400,
            cursor: busy ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          },
          onClick: toggle,
        },
        children,
      )
    }

    // ---------- 设置页 ----------

    const STYLE = `
      .tdn-page { display: flex; flex-direction: column; gap: 14px; color: var(--dsw-alias-label-primary); font-size: 13px; max-width: 720px; }
      .tdn-lead { color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
      .tdn-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
      .tdn-head { display: flex; align-items: center; gap: 10px; padding: 11px 14px; }
      .tdn-title { font-weight: 500; font-size: 13px; }
      .tdn-badge { font-size: 10.5px; padding: 1px 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary); white-space: nowrap; }
      .tdn-badge.ok { color: var(--dsw-alias-state-success-primary); }
      .tdn-badge.warn { color: var(--dsw-alias-state-warn-primary); }
      .tdn-switch { margin-left: auto; position: relative; width: 34px; height: 20px; border-radius: 999px; border: none;
        cursor: pointer; background: var(--dsw-alias-border-l2); transition: background .15s; padding: 0; flex: none; }
      .tdn-switch[aria-checked="true"] { background: ${BLUE}; }
      .tdn-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
        border-radius: 999px; background: var(--dsw-alias-bg-base); transition: left .15s; }
      .tdn-switch[aria-checked="true"]::after { left: 16px; }
      .tdn-body { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 9px;
        border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 12px; }
      .tdn-field { display: flex; flex-direction: column; gap: 5px; }
      .tdn-label { color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
      .tdn-rowline { display: flex; gap: 8px; align-items: center; }
      .tdn-input { flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 12.5px; min-width: 0; }
      .tdn-input:focus { outline: none; border-color: ${BLUE}; }
      .tdn-btn { padding: 7px 13px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer;
        font-size: 12.5px; white-space: nowrap; flex: none; }
      .tdn-btn:hover { border-color: var(--dsw-alias-border-l2); }
      .tdn-btn[disabled] { opacity: .55; cursor: default; }
      .tdn-btn.primary { border-color: ${BLUE}; color: ${BLUE}; background: rgba(66,120,234,.08); }
      .tdn-hint { color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.55; }
      .tdn-result { font-size: 12px; line-height: 1.5; padding: 7px 10px; border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2); }
      .tdn-result.ok { color: var(--dsw-alias-state-success-primary); }
      .tdn-result.err { color: var(--dsw-alias-state-error-primary); }
      .tdn-footer { display: flex; align-items: center; gap: 10px; }
    `

    function Badge({ text, kind }) {
      return h('span', { className: 'tdn-badge' + (kind ? ' ' + kind : '') }, text)
    }

    function Switch({ checked, onChange, disabled }) {
      return h('button', {
        type: 'button',
        className: 'tdn-switch',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': '启用此通知方式',
        disabled: Boolean(disabled),
        onClick: onChange,
      })
    }

    function Card({ title, badge, enabled, onToggle, children }) {
      return h(
        'div',
        { className: 'tdn-card' },
        h(
          'div',
          { className: 'tdn-head' },
          h('span', { className: 'tdn-title' }, title),
          badge,
          h(Switch, { checked: enabled, onChange: onToggle }),
        ),
        enabled ? h('div', { className: 'tdn-body' }, children) : null,
      )
    }

    function SettingsPage() {
      const [st, setSt] = React.useState(null)
      const [loadError, setLoadError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [results, setResults] = React.useState({})
      const [note, setNote] = React.useState('')

      const [scKey, setScKey] = React.useState('')
      const [hook, setHook] = React.useState('')
      const [atMobiles, setAtMobiles] = React.useState('')
      const [keyword, setKeyword] = React.useState('')

      function applyState(v) {
        setSt(v)
        setAtMobiles(v.atMobiles || '')
        setKeyword(v.keyword || '')
      }

      React.useEffect(() => {
        let alive = true
        rpc('settings.get')
          .then((v) => {
            if (alive) applyState(v)
          })
          .catch((err) => {
            if (alive) setLoadError(err && err.message ? err.message : String(err))
          })
        return () => {
          alive = false
        }
      }, [])

      function setResult(channel, value) {
        setResults((prev) => ({ ...prev, [channel]: value }))
      }

      async function toggle(channel, next) {
        setBusy('toggle:' + channel)
        setNote('')
        try {
          const v = await rpc('settings.save', { channels: { [channel]: next } })
          applyState(v)
        } catch (err) {
          setNote('保存失败：' + (err && err.message ? err.message : String(err)))
        } finally {
          setBusy('')
        }
      }

      async function saveTexts() {
        setBusy('save')
        setNote('')
        try {
          const payload = { atMobiles, keyword }
          if (scKey) payload.serverchanKey = scKey
          if (hook) payload.dingtalkWebhook = hook
          const v = await rpc('settings.save', payload)
          applyState(v)
          setScKey('')
          setHook('')
          setNote('已保存')
        } catch (err) {
          setNote('保存失败：' + (err && err.message ? err.message : String(err)))
        } finally {
          setBusy('')
        }
      }

      async function clearSecret(channel, field) {
        setBusy('clear:' + channel)
        setNote('')
        try {
          const v = await rpc('settings.save', { [field]: '__CLEAR__' })
          applyState(v)
          setNote('已清除（若 ~/.dsh/secrets 下仍有同名文件，会继续使用文件里的值）')
        } catch (err) {
          setNote('清除失败：' + (err && err.message ? err.message : String(err)))
        } finally {
          setBusy('')
        }
      }

      async function test(channel) {
        setBusy('test:' + channel)
        setResult(channel, null)
        try {
          const v = await rpc('channel.test', { channel })
          setResult(channel, v)
        } catch (err) {
          setResult(channel, { ok: false, detail: err && err.message ? err.message : String(err) })
        } finally {
          setBusy('')
        }
      }

      // 用渲染进程 Notification API 发测试通知。在 Electron 桌面端，这会发原生通知
      // 并归属 DSH 应用（名字「DeepSeek Harness」+ 鲸鱼图标）。
      async function testNative() {
        setBusy('test:native')
        setResult('native', null)
        try {
          if (typeof Notification === 'undefined') {
            setResult('native', { ok: false, detail: '当前环境不支持 Notification API' })
            return
          }
          let perm = Notification.permission
          if (perm === 'default') perm = await Notification.requestPermission()
          if (perm !== 'granted') {
            setResult('native', { ok: false, detail: '通知权限未授予（' + perm + '），请在系统弹窗里允许 DSH 通知' })
            return
          }
          const n = new Notification('✅ 示例会话标题', {
            body: '这里是本轮回复摘要：任务完成后，通知正文会显示该轮助手回复的内容预览（最多约 120 字），而非固定文案。',
            tag: 'task-done-notify-native-test',
          })
          n.onclick = () => { window.focus(); n.close() }
          setResult('native', { ok: true, detail: '已发送示例通知：标题=会话名，正文=本轮回复摘要（鲸鱼图标）' })
        } catch (err) {
          setResult('native', { ok: false, detail: err && err.message ? err.message : String(err) })
        } finally {
          setBusy('')
        }
      }

      function resultNode(channel) {
        const r = results[channel]
        if (!r) return null
        return h('div', { className: 'tdn-result ' + (r.ok ? 'ok' : 'err') }, (r.ok ? '✓ ' : '✗ ') + r.detail)
      }

      if (loadError) {
        return h('div', { className: 'tdn-page' }, h('style', null, STYLE),
          h('div', { className: 'tdn-result err' }, '读取设置失败：' + loadError))
      }
      if (!st) {
        return h('div', { className: 'tdn-page' }, h('style', null, STYLE),
          h('div', { className: 'tdn-hint' }, '读取设置中…'))
      }

      const sc = st.channels.serverchan
      const dt = st.channels.dingtalk
      const dw = st.channels.dws
      const mb = st.channels.macos || { enabled: false, supported: false }

      return h(
        'div',
        { className: 'tdn-page' },
        h('style', null, STYLE),
        h(
          'div',
          { className: 'tdn-lead' },
          '任务完成通知分两层：macOS 横幅独立于铃铛，只要开启，每轮任务结束、以及中途弹出需要你选择/批准的卡片时，都以 DSH 名义弹系统通知（鲸鱼图标）；铃铛点亮后，这两种时刻还会额外推送到微信/钉钉等手机通道（等待推送不消耗铃铛，任务完成时仍会再推一次）。',
          '每种通知方式都可以单独开关；密钥只保存在本机凭据库里，不会写进配置文件。',
        ),

        // macOS 原生横幅（以 DSH 名义，独立于铃铛）
        h(
          Card,
          {
            title: 'macOS 横幅（DSH 名义）',
            badge: h(Badge, { text: '独立于铃铛 · 鲸鱼图标', kind: 'ok' }),
            enabled: mb.enabled,
            onToggle: () => toggle('macos', !mb.enabled),
          },
          h('span', { className: 'tdn-hint' },
            '无需点亮铃铛：每轮任务结束、以及出现需要你选择/批准的卡片（提问、计划确认、审批）时，自动以 DSH 名义弹 macOS 系统通知（鲸鱼图标，子代理回合不弹）。',
            '完成通知标题为会话名、正文为本轮回复摘要；等待通知标题带 ⏳、正文为问题或待批准操作。通知由 DSH 应用自身发出。首次需在系统弹窗里允许 DSH 通知，关闭 App 后不再发送。'),
          h(
            'div',
            { className: 'tdn-rowline' },
            h('button', {
              type: 'button',
              className: 'tdn-btn primary',
              disabled: busy !== '',
              onClick: testNative,
            }, busy === 'test:native' ? '发送中…' : '发送测试通知'),
          ),
          resultNode('native'),
        ),

        // ServerChan
        h(
          Card,
          {
            title: '微信（Server酱）',
            badge: h(Badge, {
              text: sc.configured ? '已配置 ' + sc.hint : '未配置',
              kind: sc.configured ? 'ok' : 'warn',
            }),
            enabled: sc.enabled,
            onToggle: () => toggle('serverchan', !sc.enabled),
          },
          h(
            'div',
            { className: 'tdn-field' },
            h('span', { className: 'tdn-label' }, 'SendKey'),
            h(
              'div',
              { className: 'tdn-rowline' },
              h('input', {
                className: 'tdn-input',
                type: 'password',
                autoComplete: 'off',
                placeholder: sc.configured ? '已保存（留空则保持不变）' : '粘贴 Server酱 SendKey',
                value: scKey,
                onChange: (e) => setScKey(e.target.value),
              }),
              sc.configured
                ? h('button', {
                    type: 'button',
                    className: 'tdn-btn',
                    disabled: busy !== '',
                    onClick: () => clearSecret('serverchan', 'serverchanKey'),
                  }, '清除')
                : null,
            ),
            h('span', { className: 'tdn-hint' }, '在 sct.ftqq.com 微信扫码登录后获取；免费版每天 5 条。'),
          ),
          h(
            'div',
            { className: 'tdn-rowline' },
            h('button', {
              type: 'button',
              className: 'tdn-btn primary',
              disabled: busy !== '' || !sc.configured,
              onClick: () => test('serverchan'),
            }, busy === 'test:serverchan' ? '发送中…' : '发送测试消息'),
          ),
          resultNode('serverchan'),
        ),

        // DingTalk webhook
        h(
          Card,
          {
            title: '钉钉群（自定义机器人）',
            badge: h(Badge, {
              text: dt.configured ? '已配置 ' + dt.hint : '未配置',
              kind: dt.configured ? 'ok' : 'warn',
            }),
            enabled: dt.enabled,
            onToggle: () => toggle('dingtalk', !dt.enabled),
          },
          h(
            'div',
            { className: 'tdn-field' },
            h('span', { className: 'tdn-label' }, 'Webhook 地址'),
            h(
              'div',
              { className: 'tdn-rowline' },
              h('input', {
                className: 'tdn-input',
                type: 'password',
                autoComplete: 'off',
                placeholder: dt.configured ? '已保存（留空则保持不变）' : 'https://oapi.dingtalk.com/robot/send?access_token=…',
                value: hook,
                onChange: (e) => setHook(e.target.value),
              }),
              dt.configured
                ? h('button', {
                    type: 'button',
                    className: 'tdn-btn',
                    disabled: busy !== '',
                    onClick: () => clearSecret('dingtalk', 'dingtalkWebhook'),
                  }, '清除')
                : null,
            ),
          ),
          h(
            'div',
            { className: 'tdn-field' },
            h('span', { className: 'tdn-label' }, '安全关键词（消息正文必须包含）'),
            h('input', {
              className: 'tdn-input',
              type: 'text',
              value: keyword,
              onChange: (e) => setKeyword(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'tdn-field' },
            h('span', { className: 'tdn-label' }, '@ 的手机号（逗号分隔，可留空）'),
            h('input', {
              className: 'tdn-input',
              type: 'text',
              placeholder: '13000000000',
              value: atMobiles,
              onChange: (e) => setAtMobiles(e.target.value),
            }),
          ),
          h(
            'div',
            { className: 'tdn-rowline' },
            h('button', {
              type: 'button',
              className: 'tdn-btn primary',
              disabled: busy !== '' || !dt.configured,
              onClick: () => test('dingtalk'),
            }, busy === 'test:dingtalk' ? '发送中…' : '发送测试消息'),
          ),
          resultNode('dingtalk'),
        ),

        // dws
        h(
          Card,
          {
            title: '钉钉（dws 发给自己）',
            badge: h(Badge, {
              text: dw.available ? '已登录' + (dw.who ? '：' + dw.who : '') : '未登录',
              kind: dw.available ? 'ok' : 'warn',
            }),
            enabled: dw.enabled,
            onToggle: () => toggle('dws', !dw.enabled),
          },
          h('span', { className: 'tdn-hint' },
            '通过本机 dws CLI 用你的钉钉账号给自己发一条消息，可用性取决于 dws 的登录态（无需填地址）。',
            '注意：桌面钉钉在线时手机通常不会弹推送，适合作为电脑关掉时的兜底。'),
          dw.available
            ? null
            : h('span', { className: 'tdn-hint' }, '未登录原因：' + (dw.error || 'dws 未登录')),
          h(
            'div',
            { className: 'tdn-rowline' },
            h('button', {
              type: 'button',
              className: 'tdn-btn primary',
              disabled: busy !== '' || !dw.available,
              onClick: () => test('dws'),
            }, busy === 'test:dws' ? '发送中…' : '发送测试消息'),
          ),
          resultNode('dws'),
        ),

        h(
          'div',
          { className: 'tdn-footer' },
          h('button', {
            type: 'button',
            className: 'tdn-btn',
            disabled: busy !== '',
            onClick: saveTexts,
          }, busy === 'save' ? '保存中…' : '保存'),
          note ? h('span', { className: 'tdn-hint' }, note) : null,
        ),
      )
    }

    // ---------- 常驻 macOS 横幅（以 DSH 名义，独立于铃铛） ----------
    // 在 Electron 桌面端，渲染进程的 Notification API 发的是原生通知，归属 DSH 应用
    // （名字「DeepSeek Harness」+ 鲸鱼图标）。订阅 Host 转发的 api-session/status，
    // 顶层会话回合结束（running true→false）时发一条 ✅；「等待选择」横幅由
    // Host 观察者检测提问/审批后入队，这里经 waiting.poll 轮询取走弹 ⏳
    //（每会话 30s 去重）。子代理回合不弹。
    function installMacosBanner(ctx) {
      if (typeof Notification === 'undefined') return () => {}
      let enabled = true
      let disposed = false
      const lastRunning = new Map()

      const refresh = () => {
        rpc('settings.get')
          .then((v) => {
            if (!disposed && v && v.channels && v.channels.macos) enabled = Boolean(v.channels.macos.enabled)
          })
          .catch(() => {})
      }
      refresh()

      // 用列表基线初始化运行状态：插件重载时可能错过当前回合的 running=true，
      //  seeding 后当前回合结束也能正常触发。
      try {
        const snap = ctx.sessions.list.getSnapshot()
        for (const id of snap.ids) {
          const row = snap.byId[id]
          if (row) lastRunning.set(id, row.running)
        }
      } catch {}

      // 首次主动申请一次通知权限（已授权则不会弹窗）。
      if (Notification.permission === 'default') {
        try { Notification.requestPermission().catch(() => {}) } catch {}
      }

      // 解析顶层会话显示名；子代理或不在 Host 列表里的会话返回 null（不弹）。
      const topLevelLabel = (sessionId) => {
        try {
          const snap = ctx.sessions.list.getSnapshot()
          if (!snap.ids.includes(sessionId)) return null
          const row = snap.byId[sessionId]
          if (row && row.origin === 'subagent') return null
          const label = row && row.displayTitle ? row.displayTitle : '会话 ' + String(sessionId).slice(0, 8)
          return label.length > 50 ? label.slice(0, 50) + '…' : label
        } catch {
          return null
        }
      }

      const show = (title, body, tag) => {
        if (!enabled || Notification.permission !== 'granted') return
        try {
          const n = new Notification(title, { body, tag })
          n.onclick = () => { window.focus(); n.close() }
        } catch {}
      }

      const post = async (sessionId) => {
        if (!enabled || Notification.permission !== 'granted') return
        // 只对 Host 列表里的顶层会话弹；子代理不在 ids 中。
        const label = topLevelLabel(sessionId)
        if (label === null) return
        // 取本轮回复摘要作为正文（Host 实时读 turnOutline 末轮 response）。
        let body = ''
        try {
          const v = await rpc('lastReply.get', { sessionId })
          if (v && typeof v.response === 'string' && v.response.trim()) body = v.response.trim()
        } catch {}
        if (!body) body = '本轮已完成 · ' + new Date().toLocaleTimeString()
        show('✅ ' + label, body, 'task-done-notify-' + sessionId)
      }

      // ---- 等待用户选择/批准时也弹横幅 ----
      // 客户端 remote waterfall 的观察者不可靠（gateway 只取第一个 settle，
      // 且可能被 IM 竞答插件挂起），改为：Host 观察者检测到提问/审批后写入
      // 待弹队列，这里低频轮询 RPC waiting.poll 取走并弹 Notification。
      // 横幅仍由渲染进程发出（DSH 名义 + 鲸鱼图标）。每会话 30s 去重。
      const WAIT_GAP_MS = 30000
      const lastWaitBanner = new Map()
      const postWaiting = (sessionId, body) => {
        if (!enabled || Notification.permission !== 'granted') return
        const label = topLevelLabel(sessionId)
        if (label === null) return
        const now = Date.now()
        if (now - (lastWaitBanner.get(sessionId) || 0) < WAIT_GAP_MS) return
        lastWaitBanner.set(sessionId, now)
        show('⏳ ' + label + ' · 等待你的选择', body, 'task-done-notify-wait-' + sessionId)
      }

      let pollBusy = false
      const pollWaiting = async () => {
        if (disposed || pollBusy || !enabled) return
        pollBusy = true
        try {
          const v = await rpc('waiting.poll')
          const items = v && Array.isArray(v.items) ? v.items : []
          for (const item of items) {
            if (item && typeof item.sessionId === 'string') postWaiting(item.sessionId, String(item.body || '需要你的回答'))
          }
        } catch {}
        pollBusy = false
      }
      const pollTimer = setInterval(pollWaiting, 2000)

      const offStatus = ctx.remote.$on('api-session/status', (sessionId, running) => {
        const prev = lastRunning.get(sessionId)
        lastRunning.set(sessionId, running)
        if (prev === true && running === false) void post(sessionId)
      })
      // 提问卡片到达：旁路弹「等待选择」横幅，立即 next() 不拦截官方问答 UI。
      // 设置页保存（凭据记录变更）后刷新开关状态。
      const offCred = ctx.remote.$on('credentials/record-updated', refresh)

      return () => {
        disposed = true
        clearInterval(pollTimer)
        if (typeof offStatus === 'function') offStatus()
        if (typeof offCred === 'function') offCred()
      }
    }

    return {
      inject: ['slots', 'remote', 'sessions'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            { name: 'conversation.input.left', id: 'task-done-notify', order: 90 },
            BellButton,
          ),
        )
        ctx.slots.inject('settings.plugins.tab', () =>
          ctx.slots.register(
            { name: 'settings.plugins.tab', id: 'task-done-notify', order: 60, label: () => '任务完成通知' },
            SettingsPage,
          ),
        )
        ctx.effect(() => installMacosBanner(ctx), 'task-done-notify: macos native banner')
      },
    }
  },
})