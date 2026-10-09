# dsh-tool-monitoring 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-monitoring` |
| 定位 | DeepSeek Harness 的 Prometheus + Loki + Alertmanager + Grafana 可观测性插件 |
| 版本 | v0.18.0 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | Prometheus HTTP API v1、Loki HTTP API v1、Alertmanager HTTP API v2、Grafana HTTP API |
| 认证 | Bearer Token 或 HTTP Basic Auth |

### 1.1 目录

```text
src/client.ts      MonitoringClient：fetch 注入、超时、认证、错误映射、写开关
src/index.ts       85 个 defineTool 定义与插件 apply
tests/client.spec.ts  客户端契约测试
tests/tools.spec.ts   工具注册、写保护、JSON 参数、业务失败值、UI 呈现测试
examples/cordis.yml   dsh 组合配置示例
.github/workflows/ci.yml  Node 22/24 CI
```

## 2. 技术决策

### 2.1 范围控制

v0.1 聚焦 Prometheus + Alertmanager 的「可观测性闭环」：PromQL 查询、范围查询、target/alert/rule/series/label/TSDB 巡检，以及 Alertmanager 告警、分组、静默、接收人操作，共 18 个工具。

v0.2 增加 Loki 只读日志能力：LogQL 即时/范围查询、label/value、series、index stats、build info，共 7 个工具，插件总数推进到 25 个。Grafana 面板与数据源、PagerDuty 通知链路继续推迟，避免一个插件同时承担过多 API 契约和认证模型。

v0.3 继续补 Loki 只读能力：ruler rule groups、Prometheus 兼容 rules/alerts、index volume/volume_range、patterns，共 6 个工具，插件总数推进到 31 个。volume 与 patterns 仍保持查询式只读，不引入写规则或配置变更。

v0.4 增加 Grafana 只读巡检：health、datasources、dashboard 搜索/详情、folders，共 6 个工具，插件总数推进到 37 个。Grafana 工具只读取安全连接字段与 dashboard JSON，不暴露 secureJsonData 或写操作。

v0.5 增加可观测性巡检的互补能力：Loki detected fields/values 帮助快速了解日志结构，Grafana annotations 与 alert instances 帮助核对事件与当前告警状态，共 4 个只读工具，插件总数推进到 41 个。

v0.6 增加 Grafana 告警配置只读链路：alert rules 列表/详情、contact points、notification policy，共 4 个工具，插件总数推进到 45 个。使用 provisioning API，只读取查询定义、labels、annotations 与安全 settings 元数据，不暴露 secureJsonData 或写操作。

v0.7 增加 Grafana 团队与组织权限只读巡检：teams 搜索/详情、team members、org users，共 4 个工具，插件总数推进到 49 个。只返回成员、角色与最近活跃信息，不暴露用户凭据或写操作。

v0.8 增加 Grafana 服务账号与组织配额只读巡检：service accounts 搜索/详情、service account tokens、org quotas，共 4 个工具，插件总数推进到 53 个。只返回角色、token 元数据与配额用量，不暴露 token secret 或写操作。

v0.9 增加 Grafana 权限只读巡检：folder permissions 与 datasource permissions，共 2 个工具，插件总数推进到 55 个。只返回授权主体、权限级别与 actions，不暴露权限修改或写操作。

v0.10 增加 Grafana dashboard permissions 与 access control roles 只读巡检：dashboard permissions、roles 列表/详情，共 3 个工具，插件总数推进到 58 个。只返回授权主体、角色定义与 permissions/scope，不暴露角色修改或写操作。

v0.11 增加 Grafana 实例与面板审计只读巡检：admin stats、plugins、dashboard versions、dashboard snapshots，共 4 个工具，插件总数推进到 62 个。只返回实例统计、插件元数据与面板历史/快照元数据，不暴露插件秘密或写操作。

v0.12 增加 Grafana 治理审计只读巡检：user/team access control permissions、org preferences、current user、current user orgs，共 5 个工具，插件总数推进到 67 个。只返回权限、组织偏好与当前身份上下文，不暴露权限修改或写操作。

v0.13 增加 Grafana 资产与组织只读巡检：library elements 列表/详情、playlists 列表/详情、current org，共 5 个工具，插件总数推进到 72 个。只返回面板/变量模型 JSON、播放列表条目 JSON 与组织地址，不暴露写操作或凭据。

v0.14 增加 Grafana RBAC 只读巡检：built-in roles 列表/详情、user roles 直接分配，共 3 个工具，插件总数推进到 75 个。只返回角色权限与用户角色分配，不暴露角色修改或写操作。

v0.15 增加 Grafana team roles 只读巡检，并为 user/team roles 补充 `includeHidden` 过滤，新增 1 个工具，插件总数推进到 76 个。只返回团队角色分配，不暴露角色修改或写操作。

v0.16 增加 Prometheus 实例只读巡检：build info、runtime info、flags，共 3 个工具，插件总数推进到 79 个。只返回实例构建、运行与启动参数状态，不涉及写操作。

v0.17 增加 Prometheus 目录与路由只读巡检：metric metadata、discovered Alertmanagers、当前配置摘要，共 3 个工具，插件总数推进到 82 个。只返回指标 help/type/unit、发现到的 AM 端点与 YAML 配置快照，不引入配置修改或写操作。

v0.18 增加 Grafana 组织级管理只读巡检：orgs 列表、org 详情、按 org 查用户，共 3 个工具，插件总数推进到 85 个。只返回组织地址、时间戳与组织成员角色/最近活跃信息，不暴露用户凭据或写操作。

### 2.2 安全与写保护

- 默认端点：Prometheus `http://localhost:9090`，Alertmanager `http://localhost:9093`，Loki `http://localhost:3100`，Grafana `http://localhost:3000`；base URL 自动去掉尾部斜杠，配置为空字符串时禁用对应组件。
- Token 会透传为 `Authorization: Bearer <token>`；如果值已以 `Bearer ` 开头则原样使用。
- 未配置 Token 时支持 Basic Auth；四个组件分别有独立的用户名/密码配置。
- Loki 多租户场景支持 `lokiTenantId`，请求会携带 `X-Scope-OrgID`。
- 写工具默认关闭。`allowWrite: false` 时，即使在执行前传入合法参数，也返回 `{ ok: false, reason }` 且不发请求。
- `allowWrite: true` 只开启删除 series、创建/删除 silence、发送 alert 三组写工具，不改变读取能力。

### 2.3 错误映射

| 场景 | 返回/行为 |
|---|---|
| 组件未配置（读） | `{ connected: false, reason }` |
| 写操作未开启 | `{ ok: false, reason }` |
| Prometheus/Loki API 返回 `status: error` | 抛 `MonitoringError` |
| 写操作 HTTP 400 校验失败 | `{ ok: false, reason }` |
| 401/403/429/5xx | 抛 `MonitoringError` |

基础设施错误直接抛出，方便宿主按权限/限流/服务不可用处理；业务校验错误转成稳定返回值，避免模型把配置问题误判为工具故障。

### 2.4 API 细节

- 即时查询：`GET /api/v1/query?query=...&time=...`。
- 范围查询：`GET /api/v1/query_range?query=...&start=...&end=...&step=...`。
- Prometheus 巡检：`/api/v1/targets`、`/api/v1/alerts`、`/api/v1/rules`、`/api/v1/series`、`/api/v1/labels`、`/api/v1/label/{name}/values`、`/api/v1/metadata`、`/api/v1/alertmanagers`、`/api/v1/status/tsdb`、`/api/v1/status/buildinfo`、`/api/v1/status/runtimeinfo`、`/api/v1/status/config`、`/api/v1/status/flags`。
- 删除序列：`POST /api/v1/admin/tsdb/delete_series`，生产环境需要配置 admin API 权限。
- Loki 查询：`/loki/api/v1/query`、`/loki/api/v1/query_range`。
- Loki 发现：`/loki/api/v1/labels`、`/loki/api/v1/label/{name}/values`、`/loki/api/v1/series`。
- Loki 统计与状态：`/loki/api/v1/index/stats`、`/loki/api/v1/status/buildinfo`。
- Loki 规则与告警：`/loki/api/v1/rules`（YAML）、`/prometheus/api/v1/rules`、`/prometheus/api/v1/alerts`。
- Loki volume 与 patterns：`/loki/api/v1/index/volume`、`/loki/api/v1/index/volume_range`、`/loki/api/v1/patterns`。
- Loki detected fields：`/loki/api/v1/detected_fields`、`/loki/api/v1/detected_field/{name}/values`。
- Grafana：`/api/health`、`/api/admin/stats`、`/api/datasources`、`/api/datasources/uid/{uid}`、`/api/plugins`、`/api/search`、`/api/dashboards/uid/{uid}`、`/api/dashboards/uid/{uid}/versions`、`/api/dashboard/snapshots`、`/api/folders`、`/api/annotations`、`/api/alertmanager/grafana/api/v2/alerts`、`/api/v1/provisioning/alert-rules`、`/api/v1/provisioning/alert-rules/{uid}`、`/api/v1/provisioning/contact-points`、`/api/v1/provisioning/policies`、`/api/teams/search`、`/api/teams/{id}`、`/api/teams/{id}/members`、`/api/org/users`、`/api/orgs`、`/api/orgs/{id}`、`/api/orgs/{id}/users`、`/api/org/preferences`、`/api/org`、`/api/user`、`/api/user/orgs`、`/api/serviceaccounts/search`、`/api/serviceaccounts/{id}`、`/api/serviceaccounts/{id}/tokens`、`/api/org/quotas`、`/api/folders/{uid}/permissions`、`/api/dashboards/uid/{uid}/permissions`、`/api/access-control/datasources/{uid}`、`/api/access-control/roles`、`/api/access-control/roles/{uid}`、`/api/access-control/builtin-roles`、`/api/access-control/users/{id}/roles`、`/api/access-control/users/{id}/permissions`、`/api/access-control/teams/{id}/roles`、`/api/access-control/teams/{id}/permissions`、`/api/library-elements/search`、`/api/library-elements/{uid}`、`/api/playlists`、`/api/playlists/{uid}`。
- Alertmanager：`/api/v2/status`、`/api/v2/alerts`、`/api/v2/alerts/groups`、`/api/v2/silences`、`/api/v2/receivers`。
- 写操作参数使用 JSON 字符串传递：`matchersJson`、`alertsJson`；Loki series selector 使用 `matchesJson`，Grafana annotation tags 使用 `tagsJson`。工具执行前会校验 JSON 数组和必填对象字段。
- 所有请求合并 `exec.signal` 与 `AbortSignal.timeout`，默认超时 15 秒，`timeoutMs: 0` 可关闭超时。

## 3. 测试

```sh
npm install
npm run typecheck
npm test
npm run build
```

当前测试覆盖：

- Prometheus 查询 URL、Bearer 认证、查询结果映射、build/runtime/flags 状态、metadata/Alertmanagers/config 映射、系列删除写保护与请求体。
- Loki 范围查询、租户头、labels/values/series/index stats/buildinfo 映射，以及 rule groups/rules/alerts/index volume/volume_range/patterns 映射。
- Loki detected fields/values 映射。
- Grafana health、admin stats、datasources、plugins、dashboard 搜索/详情、dashboard versions/snapshots、folders、annotations、alert rules、alert instances、contact points、notification policy、teams、team members、team roles、org users、orgs 列表/详情、按 org 查用户、org preferences、current user/orgs、service accounts、service account tokens、org quotas、folder permissions、dashboard permissions、datasource permissions、access control roles、built-in roles、user roles、user/team access control permissions 映射与 Bearer 认证。
- Grafana library elements 列表/详情、playlists 列表/详情、current org 映射与分页/Bearer 认证。
- Alertmanager 状态、告警、分组、静默、接收人映射，以及静默/告警写操作。
- 85 个工具注册、组件未配置保护、JSON 参数校验、render 纯函数与 present 卡片；当前测试 51 项通过。

## 4. 后续方向

- Grafana：role grants 映射及更多 org-level RBAC 只读巡检。
- Loki：日志上下文、tail 流式观察。
- PagerDuty/Webhook：从 Alertmanager receiver 延伸到通知编排。
- 复杂告警操作：批量静默、模板化注释、Prometheus rule 热更新（需先确认服务端权限模型）。

开发新能力时继续复用 `MonitoringClient` 的统一认证、超时和错误映射，避免不同组件返回结构分裂。
