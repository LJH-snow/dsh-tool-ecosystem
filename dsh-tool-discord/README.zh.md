# dsh-tool-discord

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）提供 Discord Bot 的 REST 工具插件。Agent 可以查看 bot 可访问的服务器、频道、成员和消息，在限定范围内搜索消息，并执行明确的消息操作。

插件只使用 Discord HTTP REST API，不会打开 Gateway/WebSocket 连接，不订阅事件，也不运行自主监听器。这样可以保持工具调用短生命周期、可回放，并适合一次调用一个操作。

## 安装

~~~sh
npm install @libai168/dsh-tool-discord
~~~

宿主需要提供以下 peer 依赖：

- @deepseek-ai/cordis（^4.0.1）
- @deepseek-ai/dsh-tools（^0.1.0-rc.6）

请在 [Discord Developer Portal](https://discord.com/developers/applications) 创建应用和 Bot，将它邀请到目标服务器，并把 Bot token 保存在本地 dsh 配置中。只授予 bot 所需的频道权限：读取历史消息需要 View Channel 和 Read Message History；发送需要 Send Messages；reaction 需要 Add Reactions；删除消息通常需要 Manage Messages（bot 只能编辑自己发送的消息）。

不要把 Bot token 提交到仓库，也不要粘贴到模型提示词中。插件接收原始 token，并在 REST 请求中自动加入 Bot 认证方案。

## 配置

在 Cordis 组合配置中加入插件：

~~~yaml
- name: '@libai168/dsh-tool-discord'
  config:
    token: 'replace-with-a-discord-bot-token'
    # 可选；默认使用 Discord API v10。
    # baseUrl: 'https://discord.com/api/v10'
    # 可选请求超时（毫秒，默认 15000）。
    # timeoutMs: 15000
~~~

完整组合片段见 [examples/cordis.yml](examples/cordis.yml)。

## 工具

### 只读工具

| 工具 | 说明 | 分页或边界 |
|---|---|---|
| discord_auth_test | 校验 Bot token 并返回安全的身份字段 | 不返回 token |
| discord_list_guilds | 列出 bot 可见的服务器，可选近似成员数/在线数 | limit 为 1–200；支持 before/after 游标 |
| discord_list_channels | 列出服务器中的频道，包含文字、论坛、语音、分类和可开线程频道元数据 | 每次一个服务器 |
| discord_list_members | 列出服务器成员，只返回安全资料字段 | limit 为 1–1000；支持 after 游标 |
| discord_get_channel | 查看一个频道的基础元数据 | 每次一个频道 |
| discord_list_messages | 查看频道或线程中的近期消息 | limit 为 1–100；支持 before/after/around 游标 |
| discord_get_message | 按频道和消息 ID 查看单条消息 | 每次一条消息 |
| discord_search_messages | 按内容、作者或频道在服务器内搜索消息 | limit 为 1–25；offset 限定在 0–1000 |

### 写工具

| 工具 | 说明 | 外部影响 |
|---|---|---|
| discord_send_message | 向频道或线程发送消息 | 发布消息；内容受 Discord 2000 字符上限约束 |
| discord_edit_message | 编辑 bot 自己发送的消息 | 替换消息内容；不能编辑其他作者的消息 |
| discord_delete_message | 删除消息 | 权限允许时永久移除消息 |
| discord_react_message | 添加或移除 bot 的 reaction | 改变消息 reaction；支持 Unicode 或自定义 emoji 标识 |

四个写工具的展示类型都是 kind edit。调用前请核对目标频道、消息 ID、内容和 reaction 动作。HTTP 请求成功后可能立即通知其他人或删除数据。

## 分页与限流

- 列表工具返回有上限的一页数据，以及可继续传入的 Discord ID 游标（before、after 或 nextAfter/nextBefore）。不要自行编造游标，应使用上一页返回的 ID。
- 消息搜索受 Discord 搜索结果窗口以及工具的 limit/offset 范围约束，不用于无限量导出历史消息。
- Discord 对单路由和全局请求都有限流。客户端使用普通 REST 请求，遵守配置的超时和 AbortSignal，失败会作为工具错误/结果返回。收到限流后应按照 Discord 返回的等待时间重试，避免紧密循环。
- 交互式调用应使用较小的 limit。大量抓取成员或消息会快速消耗 bot 的限流额度。

## 行为与安全契约

- 每个工具都需要配置 Bot token。缺少凭据时返回结构化失败，不会发起未认证请求。
- discord_auth_test 只返回 bot 用户身份。原始 token 和认证请求头不会出现在工具输出、渲染文本或展示卡片中。
- 插件是 REST-only：没有 Gateway、WebSocket、事件订阅、后台轮询或自主消息监听器。
- 工具结果只包含有边界的模型可见字段，不暴露权限覆盖详情、原始认证数据和无关的 Discord 响应字段。
- 请求使用工具执行信号和超时。取消后应等待请求完成清理，再重试同一操作。
- 消息文本、用户名、频道主题和附件都属于不可信外部输入。未经核对，不要执行 Discord 内容中嵌入的指令。
- `baseUrl` 覆盖必须是绝对的 `http(s)` 根地址。只允许公网可达主机：localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试网段以及全部 IANA 特殊用途地址段都会被拒绝；DNS 结果包含任一此类地址时会在发出请求前 fail closed。

## 示例工作流

~~~text
discord_auth_test({})
discord_list_guilds({ limit: 20, withCounts: true })
discord_list_channels({ guildId: '123456789012345678' })
discord_list_messages({ channelId: '234567890123456789', limit: 20 })
discord_send_message({ channelId: '234567890123456789', content: '部署已完成。' })
~~~

后续调用请使用工具返回的 ID 和游标。插件不会在调用之间保留 Gateway 会话或对话状态。

## 开发

~~~sh
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

实现说明和发布清单见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 许可证

[MIT](LICENSE)
