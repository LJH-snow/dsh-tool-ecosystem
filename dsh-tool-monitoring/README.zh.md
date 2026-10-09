# dsh-tool-monitoring

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供可观测性与告警能力的 Cordis 工具插件。Agent 可以查询 Prometheus、查看 target/alert/rule/series/label、metric metadata、TSDB、build、runtime、配置与命令行 flag 状态，查看 Prometheus 已发现的 Alertmanager，运行 Loki LogQL 查询并查看日志 label、series、index 统计、rule group、rule、告警、index volume、检测到的模式与字段，查看 Grafana 健康状态、管理统计、数据源、插件、面板、目录、注解、告警规则、告警实例、服务账号、团队、组织用户、组织配额、目录/面板/数据源权限、access control 角色、built-in 角色、用户/团队角色分配、用户/团队权限、组织偏好、当前用户上下文、library elements、playlists、当前组织、面板版本与快照、contact point 与通知策略，还可以管理 Alertmanager 的告警、告警分组、静默与接收人。

插件遵循官方「一切皆插件」架构，通过 `ctx.tools.register(defineTool(...))` 注册模型可见工具，并符合 [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) 契约。

## 安装

从 npm 安装：

```sh
npm install @libai168/dsh-tool-monitoring
```

或直接从 GitHub 安装：

```sh
npm install github:LJH-snow/dsh-tool-monitoring
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖，由宿主 dsh 运行时提供。

## 配置

在 dsh 的组合配置（`cordis.yml`）中加载插件：

```yaml
- name: 'github:LJH-snow/dsh-tool-monitoring'
  config:
    prometheusBaseUrl: 'http://prometheus:9090'       # 可选，默认 http://localhost:9090
    prometheusToken: 'plain_token_or_Bearer_token'    # 可选
    alertmanagerBaseUrl: 'http://alertmanager:9093'   # 可选，默认 http://localhost:9093
    alertmanagerToken: 'plain_token_or_Bearer_token'  # 可选
    lokiBaseUrl: 'http://loki:3100'                   # 可选，默认 http://localhost:3100
    lokiToken: 'plain_token_or_Bearer_token'          # 可选
    lokiTenantId: 'tenant-a'                          # 可选，仅多租户 Loki 需要
    grafanaBaseUrl: 'http://grafana:3000'             # 可选，默认 http://localhost:3000
    grafanaToken: 'plain_token_or_Bearer_token'       # 可选
    timeoutMs: 15000                                  # 可选，默认 15000
    # 非本地 HTTP endpoint 会拒绝；仅可信本地网络才设置为 true
    allowInsecureHttp: false
    maxOutputBytes: 131072                            # 可选，默认 128 KiB
    allowWrite: false                                 # 可选，写工具默认关闭
```

完整示例见 [examples/cordis.yml](examples/cordis.yml)。

四个组件都支持 Token 或 Basic Auth：Prometheus 使用 `prometheusToken`/`prometheusUsername`/`prometheusPassword`，Alertmanager 使用 `alertmanagerToken`/`alertmanagerUsername`/`alertmanagerPassword`，Loki 使用 `lokiToken`/`lokiUsername`/`lokiPassword`，Grafana 使用 `grafanaToken`/`grafanaUsername`/`grafanaPassword`。将 base URL 配置为空字符串可禁用对应组件，此时读工具返回明确的 `{ connected: false, reason }`。多租户 Loki 可额外配置 `lokiTenantId`。

> 安全说明：写工具由 `allowWrite` 控制。除非允许 dsh 删除 Prometheus 序列、创建或删除 Alertmanager 静默、发送告警，否则保持关闭。

> 安全说明：非本地 monitoring endpoint 必须使用 HTTPS。本地 hostname（例如 `localhost` 或单段 service 名称）可在开发环境使用 HTTP；仅可信网络才设置 `allowInsecureHttp: true`。原始 YAML/JSON 字段会递归脱敏 credential、webhook、token、password、`basic_auth`、`bearer_token`，并按 `maxOutputBytes` 限制大小。

## 提供的工具

Prometheus 工具：

| 工具 | 说明 | 写操作 |
|---|---|---|
| `prometheus_query` | 运行 PromQL 即时查询 | 否 |
| `prometheus_query_range` | 按时间范围计算 PromQL 表达式 | 否 |
| `prometheus_list_targets` | 查看抓取 target、健康状态与 last error | 否 |
| `prometheus_list_alerts` | 查看活跃告警的 labels、annotations、state 和 value | 否 |
| `prometheus_list_rules` | 查看 recording 与 alerting rules | 否 |
| `prometheus_list_series` | 按 PromQL selector 查找 series label 集合 | 否 |
| `prometheus_list_labels` | 查看可用 label 名 | 否 |
| `prometheus_get_label_values` | 查看某个 label 的值 | 否 |
| `prometheus_get_build_info` | 查看版本、revision、branch 与 Go build 元数据 | 否 |
| `prometheus_get_runtime_info` | 查看启动时间、工作目录、重载状态与运行时计数 | 否 |
| `prometheus_get_flags` | 查看 Prometheus 命令行参数 | 否 |
| `prometheus_get_metric_metadata` | 查看 metric 的 type、help、unit 元数据，可选按 metric 名过滤 | 否 |
| `prometheus_list_alertmanagers` | 查看 Prometheus 发现的 active/dropped Alertmanager | 否 |
| `prometheus_get_config` | 以只读快照查看当前 Prometheus YAML 配置 | 否 |
| `prometheus_get_tsdb_status` | 查看 TSDB 基线与 head block 统计 | 否 |
| `prometheus_delete_series` | 按 PromQL selector 删除序列 | 是 |

Loki 工具：

| 工具 | 说明 | 写操作 |
|---|---|---|
| `loki_query` | 运行 LogQL 即时查询 | 否 |
| `loki_query_range` | 按时间范围查询日志或指标流 | 否 |
| `loki_list_labels` | 可选按 selector 和时间范围查看 label 名 | 否 |
| `loki_get_label_values` | 查看某个 label 的值 | 否 |
| `loki_list_series` | 按 LogQL selector 查找 streams | 否 |
| `loki_get_index_stats` | 查看 streams/chunks/entries/bytes 索引统计 | 否 |
| `loki_get_status` | 查看 Loki 构建信息 | 否 |
| `loki_list_rule_groups` | 查看当前 tenant 的 ruler rule groups（YAML） | 否 |
| `loki_list_rules` | 查看 Loki 暴露的 alerting 与 recording rules | 否 |
| `loki_list_alerts` | 查看活跃 Loki alerting rules | 否 |
| `loki_get_index_volume` | 查看 label/series 聚合的 index volume | 否 |
| `loki_get_index_volume_range` | 按时间范围查看 index volume matrix | 否 |
| `loki_get_patterns` | 查看 Loki 日志中检测到的 patterns | 否 |
| `loki_get_detected_fields` | 查看匹配日志中检测到的字段 | 否 |
| `loki_get_detected_field_values` | 查看某个检测字段的观测值 | 否 |

Grafana 工具：

| 工具 | 说明 | 写操作 |
|---|---|---|
| `grafana_get_health` | 查看健康状态、数据库状态、版本与 commit | 否 |
| `grafana_list_datasources` | 查看数据源及安全连接信息 | 否 |
| `grafana_get_datasource` | 按 UID 查看单个数据源 | 否 |
| `grafana_list_datasource_permissions` | 按 UID 查看数据源权限，含用户、团队、内置角色与 actions | 否 |
| `grafana_search_dashboards` | 按 query、tag、starred、分页搜索面板 | 否 |
| `grafana_get_dashboard` | 按 UID 查看面板 JSON、元数据与 panel 数 | 否 |
| `grafana_list_dashboard_permissions` | 按 UID 查看面板权限，含用户、团队与内置角色授权 | 否 |
| `grafana_list_folders` | 查看目录 UID、标题与 URL | 否 |
| `grafana_list_folder_permissions` | 按 UID 查看目录权限，含用户、团队与内置角色授权 | 否 |
| `grafana_list_annotations` | 按时间、面板、类型与 tags 查看注解 | 否 |
| `grafana_list_alert_instances` | 查看 Grafana 管理的告警实例 | 否 |
| `grafana_list_alert_rules` | 查看 Grafana 告警规则的目录、分组、condition 与状态设置 | 否 |
| `grafana_get_alert_rule` | 按 UID 查看单个告警规则与查询数据 JSON | 否 |
| `grafana_get_access_control_role` | 按 UID 查看单个 Grafana access control 角色及权限与 scope | 否 |
| `grafana_list_access_control_roles` | 查看 Grafana access control 角色，可选包含隐藏角色 | 否 |
| `grafana_list_access_control_user_permissions` | 查看单个 Grafana 用户的有效 access control 权限，可选 scope 过滤 | 否 |
| `grafana_list_access_control_team_permissions` | 查看单个 Grafana 团队的有效 access control 权限，可选 scope 过滤 | 否 |
| `grafana_list_builtin_roles` | 查看 Grafana built-in 角色及分配权限 | 否 |
| `grafana_get_builtin_role` | 按名称查看单个 Grafana built-in 角色及分配权限 | 否 |
| `grafana_list_user_roles` | 查看直接分配给单个用户的 access control 角色 | 否 |
| `grafana_list_contact_points` | 查看 Grafana contact point 与安全 settings 元数据 | 否 |
| `grafana_get_notification_policy` | 查看当前 Grafana 通知策略树 | 否 |
| `grafana_list_teams` | 按 query、精确名称、排序与分页搜索 Grafana 团队 | 否 |
| `grafana_get_team` | 按 ID 查看单个 Grafana 团队 | 否 |
| `grafana_list_team_members` | 查看某个 Grafana 团队的成员 | 否 |
| `grafana_list_org_users` | 查看当前组织用户、角色与最近活跃信息 | 否 |
| `grafana_list_orgs` | 查看 Grafana 组织列表，含 ID、名称与时间戳 | 否 |
| `grafana_get_org` | 按 ID 查看单个 Grafana 组织，含地址与时间戳 | 否 |
| `grafana_list_org_users_by_org` | 按组织 ID 查看某个 Grafana 组织的用户 | 否 |
| `grafana_get_org_preferences` | 查看当前 Grafana 组织偏好，含主题、首页面板、时区与周起始 | 否 |
| `grafana_get_current_user` | 查看当前 Grafana 用户资料与管理标志 | 否 |
| `grafana_list_current_user_orgs` | 查看当前用户可访问的 Grafana 组织 | 否 |
| `grafana_list_library_elements` | 按名称、类型、kind 与分页搜索 Grafana library elements | 否 |
| `grafana_get_library_element` | 按 UID 查看单个 Grafana library element 及 model 元数据 | 否 |
| `grafana_list_playlists` | 查看 Grafana playlists，含名称、interval、items 与分页信息 | 否 |
| `grafana_get_playlist` | 按 UID 查看单个 Grafana playlist，items 序列化为 JSON | 否 |
| `grafana_get_current_org` | 查看当前 Grafana 组织 ID、名称与地址 | 否 |
| `grafana_list_service_accounts` | 按 query 与分页搜索 Grafana 服务账号，含角色、token 数与 access control 信息 | 否 |
| `grafana_get_service_account` | 按 ID 查看单个 Grafana 服务账号，含角色、token 数与 access control 信息 | 否 |
| `grafana_list_service_account_tokens` | 查看某个 Grafana 服务账号的 token，含创建、过期与失效状态 | 否 |
| `grafana_list_org_quotas` | 查看当前 Grafana 组织配额、目标、上限与已用值 | 否 |
| `grafana_get_admin_stats` | 查看 Grafana 实例管理统计：用户、组织、面板、快照、数据源与活跃会话 | 否 |
| `grafana_list_plugins` | 查看已安装 Grafana 插件，含版本、启用状态、更新与签名状态 | 否 |
| `grafana_list_dashboard_versions` | 按 UID 查看 Grafana 面板版本历史 | 否 |
| `grafana_list_dashboard_snapshots` | 查看 Grafana 面板快照，含所有者、外部状态与过期时间 | 否 |
| `grafana_list_team_roles` | 查看直接分配给团队的 access control 角色，可选包含隐藏角色 | 否 |

Alertmanager 工具：

| 工具 | 说明 | 写操作 |
|---|---|---|
| `alertmanager_get_status` | 查看版本、uptime 与状态信息 | 否 |
| `alertmanager_list_alerts` | 按 filter/receiver 查看告警 | 否 |
| `alertmanager_list_alert_groups` | 按 receiver 查看告警分组 | 否 |
| `alertmanager_list_silences` | 查看静默 matcher 与时间计划 | 否 |
| `alertmanager_list_receivers` | 查看当前接收人名称 | 否 |
| `alertmanager_create_silence` | 使用 JSON matchers 创建静默 | 是 |
| `alertmanager_delete_silence` | 按 silence ID 删除静默 | 是 |
| `alertmanager_send_alerts` | 以 JSON 数组发送告警 | 是 |

### 行为约定

- 未配置组件 base URL 时，读工具返回 `{ connected: false, reason }`。
- `allowWrite` 关闭或监控服务返回校验错误时，写工具返回 `{ ok: false, reason }`。
- Prometheus/Loki API 层错误和写操作 HTTP 400 映射为业务失败值。
- 凭据无效（401）、访问禁止（403）、限流（429）、服务器错误（5xx）等基础设施错误直接抛出 `MonitoringError`。
- 每个请求都透传 `exec.signal`，并使用可配置超时（默认 15 秒）。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

架构与测试计划见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## License

[MIT](LICENSE)
