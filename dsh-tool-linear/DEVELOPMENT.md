# dsh-tool-linear 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-linear` |
| 定位 | DeepSeek Harness 的独立 Linear 工具插件 |
| 版本 | v0.4.0 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | Linear GraphQL API |
| 认证 | Linear 个人 API Key，直接放在 `Authorization` 请求头 |

### 1.1 目录

```text
src/client.ts      Linear GraphQL 客户端：fetch 注入、超时、认证、错误映射
src/index.ts       18 个 defineTool 定义与插件 apply
tests/client.spec.ts  客户端契约测试
tests/tools.spec.ts   工具注册、认证保护、业务失败值、UI 呈现测试
examples/cordis.yml   dsh 组合配置示例
.github/workflows/ci.yml  Node 22/24 CI
```

## 2. 技术决策

### 2.1 范围控制

v0.1 定位为「Linear Issue 管理最小闭环」：搜索、列表、读详情、创建、更新、评论，以及团队、项目、Cycle 元信息，共 13 个工具。v0.2 补上标签和用户元信息，共 17 个工具。v0.3 补上团队 workflow states，共 18 个工具。后续版本再扩展 Initiatives、Milestone、附件和分页游标，避免插件一开始就膨胀。

### 2.2 认证与安全

- 默认端点 `https://api.linear.app/graphql`，可通过 `baseUrl` 覆盖，自动去掉尾部斜杠。
- 所有工具在 v0.1 都要求 Linear 个人 API Key。请求头为 `Authorization: <apiKey>`，不加 `Bearer` 前缀。
- 未配置凭据时返回业务值，不抛出异常：读工具 `{ authenticated: false, ... }`，写工具 `{ created: false, reason }` 或 `{ ok: false, reason }`。
- `401` 表示凭据无效，`403` 表示无权限，`429` 或 `RATE_LIMITED` 表示限流，`5xx` 表示服务端错误；这些基础设施错误抛出 `LinearError`。
- 写操作校验失败（如 `BAD_USER_INPUT`）映射为业务失败值。

### 2.3 Linear GraphQL 细节

- 工单搜索使用 `searchIssues(term, teamId, first)`，可以命中标题、描述、编号和评论。
- 工单列表使用 `issues(first, filter)`，筛选形状为 `{ team.id.eq, project.id.eq, cycle.id.eq, state.type.eq }`。
- `getIssue` 先按 UUID 查询；非 UUID 或 UUID 未命中时，先通过 `searchIssues` 解析 `ABC-123` 形式的标识符，再按 UUID 读取详情。
- 创建、更新、评论分别使用 `issueCreate`、`issueUpdate`、`commentCreate` mutation。
- 所有连接查询的 `limit` 都会钳制在 1-100，默认 20。
- 每个请求使用 `AbortSignal.timeout` 与 `exec.signal` 合并，默认 15 秒超时。
- 标签列表支持 workspace 全局查询，也可按 `teamId` 缩小到指定团队；标签详情使用 `issueLabel(id)`。
- 用户列表使用 `users(first)` 获取当前 API Key 可见用户，`query` 匹配姓名、显示名或邮箱；用户详情使用 `user(id)`。
- 团队 workflow states 使用 `team(id).states(first)`，返回状态 `type` 和 `position`，用于创建/更新工单时精确选择 `stateId`。

### 2.4 错误映射

| 场景 | 返回/行为 |
|---|---|
| 未配置凭据（读） | `{ authenticated: false, ... }` |
| 未配置凭据（写） | `{ created: false, reason }` 或 `{ ok: false, reason }` |
| Issue/Cycle/Project/Team/Label/User 不存在 | `{ found: false }` |
| 写操作 GraphQL 校验失败 | `{ created: false, reason }` 或 `{ ok: false, reason }` |
| 401/403/429/5xx | 抛 `LinearError` |

## 3. 测试

```sh
npm install
npm run typecheck
npm test
npm run build
```

当前测试覆盖：

- `Authorization` 请求头与 GraphQL 端点。
- 工单搜索、列表筛选、详情回退查询。
- 创建、更新、评论 mutation 的请求体与业务失败映射。
- 评论、Cycle、Project、Team 结果映射。
- 18 个工具注册、无凭据保护、执行结果、render 纯函数与 present 卡片。

## 4. 后续方向

- `linear_list_initiatives` / `linear_list_project_milestones`：更完整的规划信息。
- 分页游标与无限列表：当前版本使用 `first` 钳制，后续可暴露 `after` 游标。

开发新能力时保持同一个客户端的错误映射和字段映射约定，避免模型看到的返回结构分裂。

## endpoint 安全校验

`baseUrl` 规范化为 origin + 路径前缀，禁止 credentials、query 和 fragment。每次请求前用 `src/url-security.ts` 做 fail-closed 目标校验：拒绝 localhost/.local 名称、环回、私有、链路本地、CGNAT、组播、保留及全部 IANA 特殊用途地址段，域名 DNS 结果含任一此类地址即拒绝。阻断清单（18 个 IPv4 + 16 个 IPv6）与 IANA 注册表对齐，`src/url-security.ts` 由 `.verify/url-security.template.ts` 生成，不得单独修改。`lookupImpl` 仅作测试注入点，不进入插件配置接口。
