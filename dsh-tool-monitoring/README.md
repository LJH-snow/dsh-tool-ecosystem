# dsh-tool-monitoring

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) monitoring and alerting capabilities. Agents can query Prometheus, inspect targets, alerts, rules, series, labels, metric metadata, TSDB, build, runtime, configuration and command-line flag status, inspect discovered Alertmanagers, run Loki LogQL queries and inspect log labels, series, index statistics, rule groups, rules, alerts, index volume, detected patterns and detected fields, inspect Grafana health, admin stats, datasources, plugins, dashboards, folders, annotations, alert rules, alert instances, service accounts, teams, org users, org quotas, folder, dashboard and datasource permissions, access control roles, built-in roles, user and team role assignments, user/team permissions, org preferences, current user context, library elements, playlists, current org, dashboard versions and snapshots, contact points and notification policies, and manage Alertmanager alerts, alert groups, silences and receivers.

It follows the official plugin architecture with `ctx.tools.register(defineTool(...))` and the [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) contract.

## Install

Install from npm:

```sh
npm install @libai168/dsh-tool-monitoring
```

Or install directly from GitHub:

```sh
npm install github:LJH-snow/dsh-tool-monitoring
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies, provided by the host dsh runtime.

## Configuration

Load the plugin in a dsh composition config (`cordis.yml`):

```yaml
- name: 'github:LJH-snow/dsh-tool-monitoring'
  config:
    prometheusBaseUrl: 'http://prometheus:9090'       # optional, default http://localhost:9090
    prometheusToken: 'plain_token_or_Bearer_token'    # optional
    alertmanagerBaseUrl: 'http://alertmanager:9093'   # optional, default http://localhost:9093
    alertmanagerToken: 'plain_token_or_Bearer_token'  # optional
    lokiBaseUrl: 'http://loki:3100'                   # optional, default http://localhost:3100
    lokiToken: 'plain_token_or_Bearer_token'          # optional
    lokiTenantId: 'tenant-a'                          # optional, multi-tenant Loki only
    grafanaBaseUrl: 'http://grafana:3000'             # optional, default http://localhost:3000
    grafanaToken: 'plain_token_or_Bearer_token'       # optional
    timeoutMs: 15000                                  # optional, default 15000
    # Non-local HTTP endpoints are rejected; set only for a trusted local network.
    allowInsecureHttp: false
    maxOutputBytes: 131072                            # optional, default 128 KiB
    allowWrite: false                                 # optional, write tools are disabled by default
```

Full example: [examples/cordis.yml](examples/cordis.yml).

Each component can also use HTTP Basic Auth with `prometheusUsername`/`prometheusPassword`, `alertmanagerUsername`/`alertmanagerPassword`, `lokiUsername`/`lokiPassword`, or `grafanaUsername`/`grafanaPassword`. Set a base URL to an empty string to disable that component and return an explicit `connected: false` business value.

> Security: write tools are gated by `allowWrite`. Keep it `false` unless the dsh runtime is explicitly allowed to delete Prometheus series, create or delete Alertmanager silences, or send alerts.

> Security: non-local monitoring endpoints must use HTTPS. Local hostnames (for example `localhost` or a single-label service name) may use HTTP for development; set `allowInsecureHttp: true` only for a trusted network. Raw YAML/JSON fields are recursively redacted for credentials, webhooks, tokens, passwords, `basic_auth`, `bearer_token`, and capped at `maxOutputBytes`.

## Tools

Prometheus tools:

| Tool | Description | Write |
|---|---|---|
| `prometheus_query` | Run a PromQL instant query | no |
| `prometheus_query_range` | Evaluate a PromQL expression over a time range | no |
| `prometheus_list_targets` | List scrape targets with health and last error | no |
| `prometheus_list_alerts` | List active alerts with labels, annotations, state and values | no |
| `prometheus_list_rules` | List recording and alerting rules | no |
| `prometheus_list_series` | Find series label sets matching a PromQL selector | no |
| `prometheus_list_labels` | List label names | no |
| `prometheus_get_label_values` | List values for one label | no |
| `prometheus_get_build_info` | Get version, revision, branch, and Go build metadata | no |
| `prometheus_get_runtime_info` | Get start time, work directory, reload status, and runtime counters | no |
| `prometheus_get_flags` | Get Prometheus command-line flags | no |
| `prometheus_get_metric_metadata` | Get metric type, help, and unit metadata, optionally filtered by metric name | no |
| `prometheus_list_alertmanagers` | List Prometheus-discovered active and dropped Alertmanagers | no |
| `prometheus_get_config` | Get the current Prometheus YAML configuration as a read-only snapshot | no |
| `prometheus_get_tsdb_status` | Read TSDB cardinality and head block statistics | no |
| `prometheus_delete_series` | Delete series matching PromQL selectors | yes |

Loki tools:

| Tool | Description | Write |
|---|---|---|
| `loki_query` | Run a LogQL instant query | no |
| `loki_query_range` | Query Loki logs or metric streams over a range | no |
| `loki_list_labels` | List label names, optionally by selector and time range | no |
| `loki_get_label_values` | List values for one label | no |
| `loki_list_series` | Find streams matching LogQL selectors | no |
| `loki_get_index_stats` | Read index statistics for streams, chunks, entries and bytes | no |
| `loki_get_status` | Read Loki build information | no |
| `loki_list_rule_groups` | List ruler rule groups for the tenant as YAML | no |
| `loki_list_rules` | List alerting and recording rules exposed by Loki | no |
| `loki_list_alerts` | List active Loki alerting rules | no |
| `loki_get_index_volume` | Get index volume for labels or series | no |
| `loki_get_index_volume_range` | Get index volume as a matrix over a range | no |
| `loki_get_patterns` | Get patterns detected in Loki logs | no |
| `loki_get_detected_fields` | Get fields detected in matching Loki log lines | no |
| `loki_get_detected_field_values` | Get observed values for one detected Loki field | no |

Grafana tools:

| Tool | Description | Write |
|---|---|---|
| `grafana_get_health` | Get health, database status, version and commit | no |
| `grafana_list_datasources` | List datasources with safe connection metadata | no |
| `grafana_get_datasource` | Get one datasource by UID | no |
| `grafana_list_datasource_permissions` | List datasource permissions by UID with user, team, built-in role, and actions | no |
| `grafana_search_dashboards` | Search dashboards by query, tag, starred status, limit and page | no |
| `grafana_get_dashboard` | Get dashboard JSON, metadata and panel count by UID | no |
| `grafana_list_dashboard_permissions` | List dashboard permissions by UID with user, team, and built-in role grants | no |
| `grafana_list_folders` | List folders with UID, title and URL | no |
| `grafana_list_folder_permissions` | List folder permissions by UID with user, team, and built-in role grants | no |
| `grafana_list_annotations` | List annotations by time, dashboard, panel, type and tags | no |
| `grafana_list_alert_instances` | List current Grafana-managed alert instances | no |
| `grafana_list_alert_rules` | List Grafana alert rules with folder, group, condition and state settings | no |
| `grafana_get_alert_rule` | Get one Grafana alert rule by UID with query data JSON | no |
| `grafana_get_access_control_role` | Get one Grafana access control role by UID with permissions and scopes | no |
| `grafana_list_access_control_roles` | List Grafana access control roles, optionally including hidden roles | no |
| `grafana_list_access_control_user_permissions` | List effective access control permissions for one Grafana user, optionally filtered by scope | no |
| `grafana_list_access_control_team_permissions` | List effective access control permissions for one Grafana team, optionally filtered by scope | no |
| `grafana_list_builtin_roles` | List Grafana built-in roles with assigned permissions | no |
| `grafana_get_builtin_role` | Get one Grafana built-in role by name with assigned permissions | no |
| `grafana_list_user_roles` | List access control roles directly assigned to one user | no |
| `grafana_list_contact_points` | List Grafana contact points with safe settings metadata | no |
| `grafana_get_notification_policy` | Get the current Grafana notification policy tree | no |
| `grafana_list_teams` | Search Grafana teams by query, exact name, sort and pagination | no |
| `grafana_get_team` | Get one Grafana team by ID | no |
| `grafana_list_team_members` | List members for one Grafana team | no |
| `grafana_list_org_users` | List Grafana org users with roles and last seen info | no |
| `grafana_list_orgs` | List Grafana organizations with id, name and timestamps | no |
| `grafana_get_org` | Get one Grafana organization by ID with address and timestamps | no |
| `grafana_list_org_users_by_org` | List users in one Grafana organization by organization ID | no |
| `grafana_get_org_preferences` | Get current Grafana organization preferences with theme, home dashboard, timezone, and week start | no |
| `grafana_get_current_user` | Get the current Grafana user profile and admin flags | no |
| `grafana_list_current_user_orgs` | List Grafana organizations available to the current user | no |
| `grafana_list_library_elements` | Search Grafana library panels and variables with name, type, kind, and pagination filters | no |
| `grafana_get_library_element` | Get one Grafana library element by UID with model metadata | no |
| `grafana_list_playlists` | List Grafana playlists with name, interval, items and pagination | no |
| `grafana_get_playlist` | Get one Grafana playlist by UID with items serialized as JSON | no |
| `grafana_get_current_org` | Get the current Grafana organization id, name and address | no |
| `grafana_list_service_accounts` | Search Grafana service accounts by query and pagination, with role, token count, and access control metadata | no |
| `grafana_get_service_account` | Get one Grafana service account by ID with role, token count, and access control metadata | no |
| `grafana_list_service_account_tokens` | List tokens for one Grafana service account with creation, expiration, and expired state | no |
| `grafana_list_org_quotas` | List current Grafana organization quotas with target, limit, and used values | no |
| `grafana_get_admin_stats` | Read Grafana instance admin stats for users, orgs, dashboards, snapshots, datasources, and active sessions | no |
| `grafana_list_plugins` | List installed Grafana plugins with version, enabled state, update availability, and signature state | no |
| `grafana_list_dashboard_versions` | List version history for a Grafana dashboard by UID | no |
| `grafana_list_dashboard_snapshots` | List Grafana dashboard snapshots with owner, external state, and expiration | no |
| `grafana_list_team_roles` | List access control roles directly assigned to one team, optionally including hidden roles | no |

Alertmanager tools:

| Tool | Description | Write |
|---|---|---|
| `alertmanager_get_status` | Get version, uptime and status payload | no |
| `alertmanager_list_alerts` | List alerts with filters and receiver | no |
| `alertmanager_list_alert_groups` | List alert groups by receiver | no |
| `alertmanager_list_silences` | List silences with matchers and schedule | no |
| `alertmanager_list_receivers` | List receiver names | no |
| `alertmanager_create_silence` | Create a silence with JSON matchers | yes |
| `alertmanager_delete_silence` | Delete a silence by ID | yes |
| `alertmanager_send_alerts` | Send an alert batch as JSON | yes |

### Behavior Contract

- If a component base URL is not configured, read tools return `{ connected: false, reason }`.
- Write tools return `{ ok: false, reason }` when `allowWrite` is disabled or when the monitoring service rejects the request with a validation error.
- Prometheus and Loki API-level errors plus HTTP 400 write validation errors are mapped to business failure values.
- Infrastructure errors such as invalid credentials (401), forbidden access (403), rate limiting (429), or server failures (5xx) throw `MonitoringError`.
- Every request forwards `exec.signal` and uses a configurable timeout (default 15 seconds).

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture and coverage.

## License

[MIT](LICENSE)
