# DSH 任务完成通知插件

**@local/task-done-notify** — 一个 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 插件：在输入框工具行加一个铃铛开关，点亮后，**本轮任务完成时自动把通知推到你手机上**——跟 AI 说完任务就可以离开电脑，做完了它会叫你。

支持三种通知方式，可在「设置 → 插件 → 任务完成通知」里分别开关、填写与测试：

| 通知方式 | 可用性判定 | 说明 |
|---|---|---|
| **微信（Server酱）** | 填了 SendKey 即可用 | 微信公众号推送，链路独立于钉钉，免费版每天 5 条 |
| **钉钉群（自定义机器人）** | 填了 Webhook 地址即可用 | 推到你指定的钉钉群，正文带安全关键词并 @ 你 |
| **钉钉（dws 发给自己）** | `dws contact user get-self` 成功即已登录 | 用本机 `dws` CLI 以你的钉钉账号给自己发一条消息，无需任何地址配置 |

## 为什么做这个

长任务经常一跑十几分钟，人早就去别处了。DSH 桌面端的完成没有任何跨设备提醒，而实测发现：

- **桌面钉钉在线时，手机钉钉不弹推送**（钉钉多端策略；自聊消息、群 @、应用内 DING 在此状态下均未触发手机推送）；
- 微信官方 iLink Bot API 需要 `context_token`（只能从用户先发的消息获得，没有冷启动推送能力），做单向通知太重；
- **Server酱**（微信公众号推送）和**钉钉群自定义机器人**是成本最低、链路最稳的两条通路 —— 于是做成插件，多通道并行，用哪条、开哪条由你决定。

## 功能

- 🔔 **输入框工具行开关**（`conversation.input.left` 插槽）：点亮后 armed 态显示 DeepSeek 蓝（#4278EA，与发送按钮同色）；
- 💬 **`/notify-when-done [on | off | status]`** 命令面：与按钮等效，且 **agent 运行中可随时 arm**（斜杠命令不走模型队列，不打断正在进行的工作）；
- 🎯 **一次性触发**：本轮结束（`agent/turn-stopping`）推送后自动熄灭，不反复打扰；
- ⚙️ **设置页**（设置 → 插件 → 任务完成通知）：三种通知方式的开关、密钥填写/清除、**逐通道发送测试消息**，以及 dws 登录态实时展示；
- 🔐 **密钥只存本机凭据库**：写进 `~/.dsh/.credentials.yaml` 的凭据记录（owner-only 权限），配置文件里永远没有明文密钥；设置页只显示“已配置 + 掩码”，不回传原值；
- 🔄 **状态恢复**：页面刷新后铃铛状态通过 RPC 从 Host 读取权威状态自动恢复。

## 安装

### 前置准备（按需，用哪种配哪种）

1. **Server酱**：前往 [sct.ftqq.com](https://sct.ftqq.com) 微信扫码登录获取 SendKey，并在微信里关注其服务号；
2. **钉钉群机器人**：任意钉钉群 → 群设置 → 机器人 → 添加「自定义（通过 Webhook 接入）」，安全设置选**自定义关键词**（如 `进度通知`），复制 Webhook 地址；
3. **dws**：本机安装并登录 `dws`（钉钉官方 CLI）即可，无需额外配置。

以上三者都**不需要**手写配置文件——装好插件后在设置页里填、点测试即可。

### 安装插件

克隆本仓库到任意目录，然后在 DSH 的 Plugin Manager（设置 → 插件）中从本地目录安装 `@local/task-done-notify`；或通过 DSH 的插件管理工具执行：

```text
install_bundle target=<本仓库的绝对路径>
```

安装后 Client 半区通过 HMR 实时生效；**Host 半区代码变更需要 remove + install 才会加载新一代模块**。

### 配置项（可选）

`cordis.patch.yml` 里的 `config` 只放**默认值与非密钥**配置，正常情况下不用改：

| 字段 | 默认值 | 说明 |
|---|---|---|
| `serverchanKeyFile` | `~/.dsh/secrets/serverchan-sendkey.txt` | 兼容旧配置：凭据记录里没有 SendKey 时读这个文件 |
| `dingtalkWebhookFile` | `~/.dsh/secrets/dingtalk-webhook.txt` | 兼容旧配置：凭据记录里没有 webhook 时读这个文件 |
| `dingtalkAtMobiles` | `[]` | 钉钉 @ 的手机号默认值 |
| `dingtalkKeyword` | `进度通知` | 钉钉机器人安全关键词默认值 |
| `enableServerchan` | `true` | 首次安装时微信通道的初始开关 |
| `enableDingtalk` | `true` | 首次安装时钉钉群通道的初始开关 |
| `enableDws` | `false` | 首次安装时 dws 通道的初始开关 |

> 设置页保存过的值优先于这里的默认值；凭据记录优先于旧的 `~/.dsh/secrets/*.txt` 文件。

## 使用

| 操作 | 方式 | 效果 |
|---|---|---|
| 开启 | 点铃铛，或 `/notify-when-done` / `/notify-when-done on` | 本轮任务完成时推送（一次性） |
| 运行中补开 | agent 正在工作时敲命令或点按钮 | 立即生效，本轮结束即推送（命令不走模型队列，不打断工作） |
| 取消 | 再点一次按钮，或 `/notify-when-done off` | 立即熄灭 |
| 查状态 | `/notify-when-done status` | 显示是否已开启，以及会用到哪些通道 |

通知内容：标题「✅ DSH 任务完成」+ 会话标识 + 完成时间；钉钉群消息额外带 `【关键词】` 前缀并按配置 @ 手机号。

## 工作原理

```text
[Client 半区（浏览器）]                      [Host 半区（Node）]
输入框铃铛 / 设置页
  │ POST /api/task-done-notify ──────────→ connection.fetch 精确路由
  │ （同源 fetch，认证栅栏内）                arm / disarm / status
  │                                          settings.get / save / channel.test
  │                                                 │
（也可以走 /notify-when-done 命令 ────────→ commands.register 的 handler）
                                                    │
                                                    ▼ 监听 agent/turn-stopping
                                              armed 中含该会话？
                                                    │ 是 → 并行发送并熄灭
                                                    ▼
                                   Server酱 HTTP POST ──→ 微信横幅
                                   钉钉 webhook JSON ──→ 群消息 @
                                   dws CLI（execFile）──→ 钉钉自己的会话
```

利用的 DSH 扩展点：

- `conversation.input.left` 插槽 — 工具行铃铛；
- `settings.plugins.tab` 插槽 — 插件设置页；
- `connection.fetch.register` — `/api/*` 包私有 RPC 路由（浏览器认证栅栏内）；
- `agent/turn-stopping` 事件 — 「本轮收尾」的准确信号（模型不再欠响应、无活动工具调用）；
- `commands.register` — 斜杠命令面；
- `ctx.credentials` 凭据记录 — `task-done-notify/settings`，密钥不落配置。

## 已知边界

- DSH Desktop 进程退出后 Host 不在，通知无法发出（armed 状态也随进程清零）；
- Server酱 免费版每天 5 条，超出后当日静默（可换 PushPlus / WxPusher 同原理服务）；
- 钉钉两条通道在**桌面钉钉在线**时手机通常不弹推送（钉钉产品策略），更适合作为「电脑不在了」场景的兜底；日常提醒以微信通道为主；
- dws 通道依赖本机 dws 登录态，登录过期后设置页会显示「未登录」及原因；
- agent 空闲时 arm 只对「下一轮任务」生效——任务已经做完才 arm 是等不到通知的。

## 凭据安全

- 密钥保存在 `~/.dsh/.credentials.yaml` 的 `records.task-done-notify/settings` 下，文件为 owner-only 权限，由 DSH 凭据服务管理；
- 设置页只显示掩码，RPC 永不返回原值；
- 清除某个密钥时，如果 `~/.dsh/secrets/` 下仍有同名文件，旧文件会继续作为回落来源——想彻底移除就把文件也删掉。