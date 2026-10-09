# dsh-tool-discord 开发文档

## 1. 项目概览

| 项目 | 说明 |
|---|---|
| 项目名 | dsh-tool-discord |
| 发布名 | @libai168/dsh-tool-discord |
| 定位 | DeepSeek Harness 的 Discord Bot REST 工具插件 |
| 工具数 | 12（8 个只读，4 个写） |
| 架构 | DiscordClient 负责 REST 请求，createTools(client) 定义工具，apply 通过 ctx.tools.register 注册 |
| 默认 API | https://discord.com/api/v10 |

插件保持独立，不依赖 Discord Gateway、WebSocket 或后台任务。HTTP 使用可注入的 fetch，工具层只负责参数、输出 schema、渲染和 kind 展示信息。

## 2. 工具边界

### 2.1 只读工具

- discord_auth_test
- discord_list_guilds
- discord_list_channels
- discord_list_members
- discord_get_channel
- discord_list_messages
- discord_get_message
- discord_search_messages

### 2.2 写工具

- discord_send_message
- discord_edit_message
- discord_delete_message
- discord_react_message

所有写工具都以 kind edit 呈现。写操作不做批量变更；每次调用只影响一个消息或一个 reaction，便于审阅和重放。

## 3. Discord REST 端点

| 客户端操作 | HTTP 端点 |
|---|---|
| authTest | GET /users/@me |
| listGuilds | GET /users/@me/guilds |
| listChannels | GET /guilds/{guild.id}/channels |
| listMembers | GET /guilds/{guild.id}/members |
| getChannel | GET /channels/{channel.id} |
| listMessages | GET /channels/{channel.id}/messages |
| getMessage | GET /channels/{channel.id}/messages/{message.id} |
| searchMessages | GET /guilds/{guild.id}/messages/search |
| sendMessage | POST /channels/{channel.id}/messages |
| editMessage | PATCH /channels/{channel.id}/messages/{message.id} |
| deleteMessage | DELETE /channels/{channel.id}/messages/{message.id} |
| reactMessage | PUT/DELETE /channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me |

请求默认指向 Discord API v10，可用 baseUrl 覆盖以便测试或兼容代理。覆盖地址仍应指向可信的 Discord API 代理，不要把 Bot token 发送到不受信任的服务。

## 4. 设计决策

### 4.1 REST-only

首版不引入 Gateway。Gateway 会带来长连接、事件订阅、重连、心跳、生命周期和跨会话状态问题；本插件的目标是让 Agent 按需读取和修改 Discord 数据。未来如果增加事件能力，应单独设计后台生命周期和权限边界，不能隐式加入当前插件。

### 4.2 认证与敏感数据

- 配置接收原始 Bot token，客户端生成 Authorization: Bot <token> 请求头。
- 认证结果只保留 bot 的用户 ID、用户名、全局名称等安全字段。
- 不在错误、render、presentCall 或 presentResult 中输出 token、完整请求头或凭据。
- 测试 fixture 使用明确的假 token，不使用文档中的真实 Discord 凭据。

### 4.3 endpoint 安全校验

`baseUrl` 规范化为 origin + 路径前缀，禁止 credentials、query 和 fragment。每次请求前用 `src/url-security.ts` 做 fail-closed 目标校验：拒绝 localhost/.local 名称、环回、私有、链路本地、CGNAT、组播、保留及全部 IANA 特殊用途地址段，域名 DNS 结果含任一此类地址即拒绝。阻断清单（18 个 IPv4 + 16 个 IPv6）与 IANA 注册表对齐，`src/url-security.ts` 由 `.verify/url-security.template.ts` 生成，不得单独修改。`lookupImpl` 仅作测试注入点，不进入插件配置接口。

### 4.3 分页与结果边界

- Guild、成员和消息列表使用 Discord ID 游标；工具对 limit 进行范围约束。
- 消息搜索使用有限的频道/消息窗口和 offset，避免无界抓取、过大的模型上下文和无限请求。
- 输出只映射工具需要的字段，避免把权限覆盖和其他原始 Discord 对象直接交给模型。

### 4.4 限流、超时和取消

- 每次请求都使用配置的超时，并透传 exec.signal。
- Discord 的 429、4xx 和 5xx 应保持为清晰的客户端错误；调用方按 Discord 的 Retry-After/限流提示退避，不进行紧密自动重试。
- 列表默认使用小页，避免一次操作耗尽全局或路由限流预算。

### 4.5 外部写入

发送、编辑、删除和 reaction 都可能立即影响真实服务器。工具 schema 要求明确的目标 ID 和内容；写工具统一使用 kind edit，不提供批量删除或批量发布。

## 5. 测试约定

客户端应接受注入的 fetch 实现，以便在不访问 Discord 的情况下覆盖：

- Authorization header、默认 API base URL 和 query 参数；
- 认证、列表、详情、搜索和四个写端点的请求方法与 body；
- Discord 错误包络、429 限流信息、超时和 AbortSignal；
- 分页游标、边界 clamp、消息内容长度和自定义 emoji 编码；
- token 不进入结果、渲染文本或错误信息。

工具测试应直接驱动 createTools(client)，确认缺少 token 时不发请求、只读/写工具数量正确、输出 schema 可序列化，以及写工具的 kind 为 edit。

## 6. 发布前验证

~~~sh
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

发布前还应确认：

1. lib/ 包含编译后的入口和声明文件；
2. README.md、README.zh.md、DEVELOPMENT.md、examples/cordis.yml、LICENSE 被 npm 包收录；
3. 包含 dsh-plugin 与 awesome-dsh-plugin 关键词；
4. npm 发布使用 npm publish --access public，并在发布后核验 dist-tags.latest；
5. GitHub 仓库添加 dsh-plugin、deepseek-harness 和 discord topics。

## 7. 后续方向

- 增加线程/论坛专用读取工具，但继续维持有界分页。
- 在单独的设计中评估 Gateway 事件和重连，不把长连接悄悄加入 REST 插件。
- 增加 webhook 管理前先定义凭据隔离、目标校验和写入确认策略。
- 增加真实 Discord sandbox smoke 时使用专用测试服务器和短期 token，禁止把凭据放进测试 fixture 或 CI 日志。
