import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  MonitoringClient,
  MonitoringError,
  type GrafanaAccessControlPermissionItem,
  type AlertmanagerAlertItem,
  type AlertmanagerGroupItem,
  type AlertmanagerSilenceItem,
  type GrafanaAccessControlRoleItem,
  type GrafanaAlertRuleItem,
  type GrafanaAlertInstanceItem,
  type GrafanaAdminStatsData,
  type GrafanaAnnotationItem,
  type GrafanaBuiltinRoleItem,
  type GrafanaContactPointItem,
  type GrafanaCurrentOrgData,
  type GrafanaCurrentUserData,
  type GrafanaDashboardData,
  type GrafanaDashboardPermissionItem,
  type GrafanaDashboardSnapshotItem,
  type GrafanaDashboardSummaryItem,
  type GrafanaDashboardVersionItem,
  type GrafanaDatasourceItem,
  type GrafanaDatasourcePermissionItem,
  type GrafanaFolderItem,
  type GrafanaFolderPermissionItem,
  type GrafanaHealthData,
  type GrafanaLibraryElementData,
  type GrafanaLibraryElementItem,
  type GrafanaNotificationPolicyData,
  type GrafanaOrgDetailData,
  type GrafanaOrgItem,
  type GrafanaOrgPreferencesData,
  type GrafanaOrgUserItem,
  type GrafanaOrgQuotaItem,
  type GrafanaPluginItem,
  type GrafanaPlaylistDetailData,
  type GrafanaPlaylistDetailItem,
  type GrafanaPlaylistItem,
  type GrafanaServiceAccountData,
  type GrafanaServiceAccountItem,
  type GrafanaServiceAccountTokenItem,
  type GrafanaTeamData,
  type GrafanaTeamItem,
  type GrafanaTeamMemberItem,
  type GrafanaUserOrgItem,
  type LokiDetectedFieldItem,
  type LokiAlertItem,
  type LokiIndexStats,
  type LokiPatternItem,
  type LokiQueryData,
  type LokiRuleItem,
  type LokiSeriesItem,
  type LokiStatusData,
  type LokiVolumeData,
  type PrometheusAlertItem,
  type PrometheusAlertmanagerItem,
  type PrometheusBuildInfoData,
  type PrometheusConfigData,
  type PrometheusFlagsData,
  type PrometheusMetadataItem,
  type PrometheusRuleItem,
  type PrometheusRuntimeInfoData,
  type PrometheusTargetItem,
} from './client.js'

export const name = 'dsh-tool-monitoring'
export const inject = ['tools']

export interface MonitoringPluginConfig {
  prometheusBaseUrl?: string
  prometheusToken?: string
  prometheusUsername?: string
  prometheusPassword?: string
  alertmanagerBaseUrl?: string
  alertmanagerToken?: string
  alertmanagerUsername?: string
  alertmanagerPassword?: string
  lokiBaseUrl?: string
  lokiToken?: string
  lokiUsername?: string
  lokiPassword?: string
  lokiTenantId?: string
  grafanaBaseUrl?: string
  grafanaToken?: string
  grafanaUsername?: string
  grafanaPassword?: string
  timeoutMs?: number
  allowInsecureHttp?: boolean
  maxOutputBytes?: number
  allowWrite?: boolean
}

export function apply(ctx: Context, config: MonitoringPluginConfig = {}) {
  const client = new MonitoringClient(config)
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

/** Build the tool definitions for a client. Exported so tests can drive execute/render directly. */
export function createTools(client: MonitoringClient) {
  return [
    defineTool({
      name: 'prometheus_query',
      description: 'Run a Prometheus instant vector, scalar, string, or matrix query.',
      parameters: {
        query: { type: 'string', required: true, description: 'PromQL expression' },
        time: { type: 'string', description: 'Evaluation timestamp in RFC 3339 or Unix milliseconds; optional' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderQuery(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Prometheus query: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} result(s)` }
      },
      async execute(args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        const data = await client.query(args.query as string, { time: args.time, signal: exec.signal })
        return data
      },
    }),

    defineTool({
      name: 'prometheus_query_range',
      description: 'Evaluate a PromQL expression over a time range and return matrix samples.',
      parameters: {
        query: { type: 'string', required: true, description: 'PromQL expression' },
        start: { type: 'string', required: true, description: 'Range start as Unix time, RFC 3339, or relative time' },
        end: { type: 'string', required: true, description: 'Range end as Unix time, RFC 3339, or relative time' },
        step: { type: 'string', required: true, description: 'Query resolution step, for example 60s' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderQuery(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Prometheus range: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} series` }
      },
      async execute(args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.queryRange(args.query as string, {
          start: args.start as string,
          end: args.end as string,
          step: args.step as string,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'prometheus_list_targets',
      description: 'List active and dropped Prometheus scrape targets with health and last error.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            activeCount: { type: 'number' },
            droppedCount: { type: 'number' },
            items: { type: 'array', items: targetItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
          return renderTargets(value)
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus targets', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; activeCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.activeCount ?? 0} active target(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listTargets({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_list_alerts',
      description: 'List active Prometheus alerts with labels, annotations, state, and values.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: prometheusAlertItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
          return renderPrometheusAlerts(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus alerts', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} alert(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listAlerts({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_list_rules',
      description: 'List Prometheus recording and alerting rules together with active alert counts.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: prometheusRuleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
          return renderRules(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus rules', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} rule(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listRules({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_list_series',
      description: 'Find Prometheus series label sets matching a PromQL selector.',
      parameters: {
        match: { type: 'string', required: true, description: 'PromQL series selector, for example up' },
        start: { type: 'string', description: 'Optional start time' },
        end: { type: 'string', description: 'Optional end time' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { labelsJson: { type: 'string' } },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
          return text((value.items ?? []).map((item: any) => item.labelsJson ?? '').join('\n'))
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Prometheus series ${args.match}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} series` }
      },
      async execute(args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listSeries(args.match as string, {
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'prometheus_list_labels',
      description: 'List label names available in Prometheus.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args, value) => renderStrings(value, 'No Prometheus labels found.'),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus labels', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: string[] }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} label(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listLabels({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_label_values',
      description: 'List values for one Prometheus label.',
      parameters: {
        labelName: { type: 'string', required: true, description: 'Prometheus label name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args, value) => renderStrings(value, 'No values found for this label.'),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Prometheus label ${args.labelName}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: string[] }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} value(s)` }
      },
      async execute(args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getLabelValues(args.labelName as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_tsdb_status',
      description: 'Get Prometheus TSDB cardinality and head block statistics.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            headSeriesCount: { type: 'number' },
            statsJson: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
          return text(`head series: ${value.headSeriesCount ?? 0}\n${value.statsJson ?? ''}`)
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus TSDB status', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; headSeriesCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.headSeriesCount ?? 0} head series` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getTsdbStatus({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_build_info',
      description: 'Get Prometheus build information including version, revision, branch, and Go runtime.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            version: { type: 'string' },
            revision: { type: 'string' },
            branch: { type: 'string' },
            goVersion: { type: 'string' },
            buildUser: { type: 'string' },
            buildDate: { type: 'string' },
            infoJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderPrometheusBuildInfo(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus build info', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; version?: string }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `Prometheus ${v.version ?? ''}` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getBuildInfo({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_runtime_info',
      description: 'Get Prometheus runtime information including start time, work directory, and reload status.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            startTime: { type: 'string' },
            cwd: { type: 'string' },
            reloadConfigSuccess: { type: 'boolean' },
            lastConfigTime: { type: 'string' },
            goroutineCount: { type: 'number' },
            timeSeriesCount: { type: 'number' },
            runtimeJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderPrometheusRuntimeInfo(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus runtime info', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; startTime?: string }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: 'Runtime info' }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getRuntimeInfo({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_flags',
      description: 'Get Prometheus command line flags as a read-only flag map.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            count: { type: 'number' },
            flagsJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderPrometheusFlags(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus flags', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; count?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.count ?? 0} flag(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getFlags({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_metric_metadata',
      description: 'Get Prometheus metric metadata including type, help, and unit, optionally filtered by metric name.',
      parameters: {
        metric: { type: 'string', description: 'Optional exact metric name filter' },
        limit: { type: 'number', description: 'Maximum number of metrics to return; Prometheus default is 10' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            count: { type: 'number' },
            items: { type: 'array', items: prometheusMetadataItemSchema },
            metadataJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderPrometheusMetadata(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: args.metric ? `Prometheus metadata: ${args.metric}` : 'Prometheus metadata', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; count?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.count ?? 0} metadata entrie(s)` }
      },
      async execute(args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getMetadata({
          metric: args.metric,
          limit: args.limit,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'prometheus_list_alertmanagers',
      description: 'List Prometheus-discovered active and dropped Alertmanagers with endpoint and labels.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            activeCount: { type: 'number' },
            droppedCount: { type: 'number' },
            activeItems: { type: 'array', items: prometheusAlertmanagerItemSchema },
            droppedItems: { type: 'array', items: prometheusAlertmanagerItemSchema },
          },
        },
        render: (_args, value) => renderPrometheusAlertmanagers(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus Alertmanagers', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; activeCount?: number; droppedCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `${v.activeCount ?? 0} active, ${v.droppedCount ?? 0} dropped` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.listAlertmanagers({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_get_config',
      description: 'Get the current Prometheus YAML configuration as a read-only snapshot.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            configYaml: { type: 'string' },
            length: { type: 'number' },
          },
        },
        render: (_args, value) => renderPrometheusConfig(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Prometheus config', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; length?: number }
        if (!v.connected) return { card: 'generic', title: 'Prometheus unavailable' }
        return { card: 'generic', title: `Prometheus config (${v.length ?? 0} chars)` }
      },
      async execute(_args, exec) {
        if (!client.hasPrometheus()) return unavailable('Prometheus base URL is not configured.')
        return client.getConfig({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'prometheus_delete_series',
      description: 'Delete Prometheus series matching PromQL selectors. WRITE operation: requires allowWrite: true.',
      parameters: {
        matchersJson: { type: 'string', required: true, description: 'JSON array of PromQL selectors, for example ["up{instance=\"localhost:9090\"}"]' },
        start: { type: 'string', description: 'Optional start time' },
        end: { type: 'string', description: 'Optional end time' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text('Prometheus series deleted.')
          : text(`Could not delete Prometheus series: ${value.reason}`),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: 'Delete Prometheus series', kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        return { card: 'generic', title: v.ok ? 'Series deleted' : 'Delete failed', content: [{ type: 'text', text: v.reason ?? '' }] }
      },
      async execute(args, exec) {
        const matchers = parseJsonArray(args.matchersJson)
        if (!matchers.ok) return { ok: false, reason: 'matchersJson must be a valid JSON array.' }
        if (!matchers.value?.length || matchers.value.some(matcher => typeof matcher !== 'string' || !matcher.trim())) {
          return { ok: false, reason: 'matchersJson must contain non-empty PromQL selector strings.' }
        }
        return client.deleteSeries(matchers.value as string[], {
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'alertmanager_get_status',
      description: 'Get Alertmanager version, uptime, cluster, and config status.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            uptime: { type: 'string' },
            version: { type: 'string' },
            statusJson: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Alertmanager is not configured.')
          return text(`version: ${value.version ?? ''}\nuptime: ${value.uptime ?? ''}\n${value.statusJson ?? ''}`)
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Alertmanager status', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; version?: string }
        return { card: 'generic', title: v.connected ? `Alertmanager ${v.version ?? ''}` : 'Alertmanager unavailable' }
      },
      async execute(_args, exec) {
        if (!client.hasAlertmanager()) return unavailable('Alertmanager base URL is not configured.')
        return client.getAlertmanagerStatus({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'alertmanager_list_alerts',
      description: 'List Alertmanager alerts with labels, annotations, status, and receivers.',
      parameters: {
        filter: { type: 'string', description: 'Matcher expression, for example alertname="HighCPUUsage"' },
        active: { type: 'boolean', description: 'Include active alerts (default true)' },
        silenced: { type: 'boolean', description: 'Include silenced alerts (default true)' },
        inhibited: { type: 'boolean', description: 'Include inhibited alerts (default true)' },
        receiver: { type: 'string', description: 'Filter by receiver name regex' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: alertmanagerAlertItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Alertmanager is not configured.')
          return renderAlertmanagerAlerts(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Alertmanager alerts', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Alertmanager unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} alert(s)` }
      },
      async execute(args, exec) {
        if (!client.hasAlertmanager()) return unavailable('Alertmanager base URL is not configured.')
        return client.listAlertmanagerAlerts({
          filter: args.filter,
          active: args.active,
          silenced: args.silenced,
          inhibited: args.inhibited,
          receiver: args.receiver,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'alertmanager_list_alert_groups',
      description: 'List Alertmanager alert groups by receiver and labels.',
      parameters: {
        receiver: { type: 'string', description: 'Filter by receiver name' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: alertmanagerGroupItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Alertmanager is not configured.')
          return renderAlertGroups(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Alertmanager groups', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Alertmanager unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} group(s)` }
      },
      async execute(args, exec) {
        if (!client.hasAlertmanager()) return unavailable('Alertmanager base URL is not configured.')
        return client.listAlertGroups({ receiver: args.receiver, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'alertmanager_list_silences',
      description: 'List Alertmanager silences with matchers, schedule, creator, and status.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: alertmanagerSilenceItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Alertmanager is not configured.')
          return renderSilences(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Alertmanager silences', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Alertmanager unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} silence(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasAlertmanager()) return unavailable('Alertmanager base URL is not configured.')
        return client.listSilences({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'alertmanager_list_receivers',
      description: 'List Alertmanager receiver names from the current routing configuration.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: { name: { type: 'string' } },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Alertmanager is not configured.')
          const names = (value.items ?? []).map((item: any) => item.name ?? '').filter(Boolean)
          return text(names.length > 0 ? names.join('\n') : 'No Alertmanager receivers found.')
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Alertmanager receivers', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        return { card: 'generic', title: v.connected ? `${(v.items ?? []).length} receiver(s)` : 'Alertmanager unavailable' }
      },
      async execute(_args, exec) {
        if (!client.hasAlertmanager()) return unavailable('Alertmanager base URL is not configured.')
        return client.listReceivers({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'alertmanager_create_silence',
      description: 'Create an Alertmanager silence. WRITE operation: requires allowWrite: true.',
      parameters: {
        matchersJson: { type: 'string', required: true, description: 'JSON array of matchers, for example [{"name":"alertname","value":"HighCPUUsage"}]' },
        startsAt: { type: 'string', required: true, description: 'RFC 3339 start time' },
        endsAt: { type: 'string', required: true, description: 'RFC 3339 end time' },
        createdBy: { type: 'string', required: true, description: 'Silence creator' },
        comment: { type: 'string', required: true, description: 'Why this silence exists' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            id: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text(`Silence created: ${value.id ?? ''}`)
          : text(`Could not create silence: ${value.reason}`),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Create Alertmanager silence', kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; id?: string; reason?: string }
        return { card: 'generic', title: v.ok ? `Silence ${v.id ?? ''} created` : 'Create silence failed', content: [{ type: 'text', text: v.reason ?? '' }] }
      },
      async execute(args, exec) {
        const matchers = parseJsonArray(args.matchersJson)
        if (!matchers.ok) return { ok: false, reason: 'matchersJson must be a valid JSON array.' }
        if (!matchers.value?.length || matchers.value.some(matcher => !isValidMatcher(matcher))) {
          return { ok: false, reason: 'matchersJson must contain matcher objects with name and value strings.' }
        }
        if (!args.startsAt || !args.endsAt || !args.createdBy || !args.comment) {
          return { ok: false, reason: 'startsAt, endsAt, createdBy, and comment are required.' }
        }
        return client.createSilence({
          matchers: matchers.value,
          startsAt: args.startsAt as string,
          endsAt: args.endsAt as string,
          createdBy: args.createdBy as string,
          comment: args.comment as string,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'alertmanager_delete_silence',
      description: 'Delete an Alertmanager silence. WRITE operation: requires allowWrite: true.',
      parameters: {
        silenceId: { type: 'string', required: true, description: 'Alertmanager silence ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text(`Silence ${_args.silenceId} deleted.`)
          : text(`Could not delete silence: ${value.reason}`),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Delete silence ${args.silenceId}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        return { card: 'generic', title: v.ok ? 'Silence deleted' : 'Delete silence failed', content: [{ type: 'text', text: v.reason ?? '' }] }
      },
      async execute(args, exec) {
        if (!args.silenceId) return { ok: false, reason: 'silenceId is required.' }
        return client.deleteSilence(args.silenceId as string, exec.signal)
      },
    }),

    defineTool({
      name: 'alertmanager_send_alerts',
      description: 'Send alerts to Alertmanager. WRITE operation: requires allowWrite: true.',
      parameters: {
        alertsJson: { type: 'string', required: true, description: 'JSON array of alerts with labels and optional annotations' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean' },
            reason: { type: 'string' },
          },
        },
        render: (_args, value) => value.ok
          ? text('Alerts sent to Alertmanager.')
          : text(`Could not send alerts: ${value.reason}`),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Send Alertmanager alerts', kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        return { card: 'generic', title: v.ok ? 'Alerts sent' : 'Send alerts failed', content: [{ type: 'text', text: v.reason ?? '' }] }
      },
      async execute(args, exec) {
        const alerts = parseJsonArray(args.alertsJson)
        if (!alerts.ok) return { ok: false, reason: 'alertsJson must be a valid JSON array.' }
        if (!alerts.value?.length || alerts.value.some(alert => !isValidAlert(alert))) {
          return { ok: false, reason: 'alertsJson must contain alert objects with labels objects.' }
        }
        return client.sendAlerts(alerts.value, exec.signal)
      },
    }),

    defineTool({
      name: 'loki_query',
      description: 'Run a Loki LogQL instant query against a single point in time.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL expression, for example sum(rate({job="app"}[5m]))' },
        time: { type: 'string', description: 'Evaluation time as Unix nanoseconds, RFC 3339, or a supported Loki timestamp' },
        limit: { type: 'integer', description: 'Maximum entries, default 100' },
        direction: { type: 'string', enum: ['backward', 'forward'], description: 'Log sort direction, default backward' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            entryCount: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiQuery(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki query: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number; entryCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} stream(s), ${v.entryCount ?? 0} entries` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiQuery(args.query as string, {
          time: args.time,
          limit: args.limit,
          direction: args.direction,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_query_range',
      description: 'Query Loki logs or metric streams over a time range with LogQL.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL expression' },
        start: { type: 'string', description: 'Start time as Unix nanoseconds, RFC 3339, or a supported Loki timestamp' },
        end: { type: 'string', description: 'End time as Unix nanoseconds, RFC 3339, or a supported Loki timestamp' },
        step: { type: 'string', description: 'Metric query step, for example 5m or 300' },
        limit: { type: 'integer', description: 'Maximum entries, default 100' },
        direction: { type: 'string', enum: ['backward', 'forward'], description: 'Log sort direction, default backward' },
        interval: { type: 'string', description: 'Only return log entries at or above this interval, for example 30s' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            entryCount: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiQuery(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki range: ${args.query}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number; entryCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} stream(s), ${v.entryCount ?? 0} entries` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiQueryRange(args.query as string, {
          start: args.start,
          end: args.end,
          step: args.step,
          limit: args.limit,
          direction: args.direction,
          interval: args.interval,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_list_labels',
      description: 'List Loki label names, optionally filtered by a stream selector and time range.',
      parameters: {
        query: { type: 'string', description: 'Optional LogQL stream selector, for example {app="myapp"}' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args, value) => renderLokiStrings(value, 'No Loki labels found.'),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki labels ${args.query ?? ''}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: string[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} label(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiListLabels({
          query: args.query,
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_label_values',
      description: 'List values for one Loki label, optionally filtered by a stream selector and time range.',
      parameters: {
        labelName: { type: 'string', required: true, description: 'Loki label name' },
        query: { type: 'string', description: 'Optional LogQL stream selector' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
          },
        },
        render: (_args, value) => renderLokiStrings(value, 'No values found for this Loki label.'),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki label ${args.labelName}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: string[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} value(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetLabelValues(args.labelName as string, {
          query: args.query,
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_list_series',
      description: 'Find Loki streams matching one or more LogQL stream selectors.',
      parameters: {
        matchesJson: { type: 'string', required: true, description: 'JSON array of LogQL stream selectors, for example ["{app=\\"api\\"}", "{job=\\"loki\\"}"]' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: lokiSeriesItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
          return renderLokiSeries(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Loki series', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} stream(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        const matches = parseJsonArray(args.matchesJson)
        if (!matches.ok) return unavailable('matchesJson must be a valid JSON array.')
        if (!matches.value?.length || matches.value.some(match => typeof match !== 'string' || !match.trim())) {
          return unavailable('matchesJson must contain non-empty LogQL stream selector strings.')
        }
        return client.lokiListSeries(matches.value as string[], {
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_index_stats',
      description: 'Get Loki index statistics for streams, chunks, entries, and bytes matching a LogQL selector.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL matcher, for example {job="app"}' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            streams: { type: 'number' },
            chunks: { type: 'number' },
            entries: { type: 'number' },
            bytes: { type: 'number' },
            statsJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiIndexStats(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki stats ${args.query}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; streams?: number; chunks?: number; entries?: number; bytes?: number }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${v.streams ?? 0} streams, ${v.bytes ?? 0} bytes` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetIndexStats(args.query as string, {
          start: args.start,
          end: args.end,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_status',
      description: 'Get Loki build information including version, revision, branch, and Go version.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            version: { type: 'string' },
            revision: { type: 'string' },
            branch: { type: 'string' },
            buildDate: { type: 'string' },
            goVersion: { type: 'string' },
            statusJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiStatus(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Loki status', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; version?: string }
        return { card: 'generic', title: v.connected ? `Loki ${v.version ?? ''}` : 'Loki unavailable' }
      },
      async execute(_args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetStatus({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'loki_list_rule_groups',
      description: 'List Loki ruler rule groups configured for the authenticated tenant as YAML.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            ruleGroupsYaml: { type: 'string' },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
          return text(value.ruleGroupsYaml || 'No Loki rule groups found.')
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Loki rule groups', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean }
        return { card: 'generic', title: v.connected ? 'Loki rule groups' : 'Loki unavailable' }
      },
      async execute(_args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiListRuleGroups({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'loki_list_rules',
      description: 'List Loki alerting and recording rules exposed by the Prometheus-compatible rules endpoint.',
      parameters: {
        type: { type: 'string', enum: ['alert', 'record'], description: 'Optional rule type filter' },
        file: { type: 'string', description: 'Optional file/group file filter' },
        ruleGroup: { type: 'string', description: 'Optional rule group name filter' },
        ruleName: { type: 'string', description: 'Optional rule name filter' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: lokiRuleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
          return renderLokiRules(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki rules ${args.type ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} rule(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiListRules({
          type: args.type,
          file: args.file,
          ruleGroup: args.ruleGroup,
          ruleName: args.ruleName,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_list_alerts',
      description: 'List active Loki alerting rules from the Prometheus-compatible alerts endpoint.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: prometheusAlertItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
          return renderLokiAlerts(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Loki alerts', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} alert(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiListAlerts({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'loki_get_index_volume',
      description: 'Get Loki index volume for label or series aggregation over a time range.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL stream selector, for example {job="app"}' },
        start: { type: 'string', required: true, description: 'Start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', required: true, description: 'End time as Unix nanoseconds or RFC 3339' },
        limit: { type: 'integer', description: 'Maximum series to return, default 100' },
        targetLabels: { type: 'string', description: 'Comma-separated labels to aggregate into' },
        aggregateBy: { type: 'string', enum: ['series', 'labels'], description: 'Aggregate into series or labels, default series' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            totalBytes: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiVolume(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki volume ${args.query}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number; totalBytes?: number }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} series, ${v.totalBytes ?? 0} bytes` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetIndexVolume(args.query as string, {
          start: args.start as string,
          end: args.end as string,
          limit: args.limit,
          targetLabels: args.targetLabels,
          aggregateBy: args.aggregateBy,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_index_volume_range',
      description: 'Get Loki index volume as a Prometheus-style matrix over a time range.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL stream selector, for example {job="app"}' },
        start: { type: 'string', required: true, description: 'Start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', required: true, description: 'End time as Unix nanoseconds or RFC 3339' },
        step: { type: 'string', description: 'Resolution step, for example 5m or 300' },
        limit: { type: 'integer', description: 'Maximum series to return, default 100' },
        targetLabels: { type: 'string', description: 'Comma-separated labels to aggregate into' },
        aggregateBy: { type: 'string', enum: ['series', 'labels'], description: 'Aggregate into series or labels, default series' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            resultType: { type: 'string' },
            seriesCount: { type: 'number' },
            totalBytes: { type: 'number' },
            resultJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderLokiVolume(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki volume range ${args.query}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; seriesCount?: number; totalBytes?: number }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${v.seriesCount ?? 0} series, ${v.totalBytes ?? 0} bytes` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetIndexVolumeRange(args.query as string, {
          start: args.start as string,
          end: args.end as string,
          step: args.step,
          limit: args.limit,
          targetLabels: args.targetLabels,
          aggregateBy: args.aggregateBy,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_patterns',
      description: 'Get pattern detection results for Loki log streams over a time range.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL stream selector, for example {job="app"}' },
        start: { type: 'string', required: true, description: 'Start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', required: true, description: 'End time as Unix nanoseconds or RFC 3339' },
        step: { type: 'string', description: 'Step between pattern samples, for example 10s' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: lokiPatternItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
          return renderLokiPatterns(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki patterns ${args.query}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} pattern(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetPatterns(args.query as string, {
          start: args.start as string,
          end: args.end as string,
          step: args.step,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_detected_fields',
      description: 'Get fields detected in Loki log lines matching a stream selector.',
      parameters: {
        query: { type: 'string', required: true, description: 'LogQL stream selector, for example {job="app"}' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
        since: { type: 'string', description: 'Optional relative time range, for example 1h' },
        step: { type: 'string', description: 'Optional step between sample windows' },
        lineLimit: { type: 'integer', description: 'Maximum log lines to scan per shard, default 100' },
        limit: { type: 'integer', description: 'Maximum fields to return, default 1000' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: lokiDetectedFieldItemSchema },
            limit: { type: 'number' },
          },
        },
        render: (_args, value) => renderLokiDetectedFields(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki fields ${args.query}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} field(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetDetectedFields(args.query as string, {
          start: args.start,
          end: args.end,
          since: args.since,
          step: args.step,
          lineLimit: args.lineLimit,
          limit: args.limit,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'loki_get_detected_field_values',
      description: 'Get values observed for one detected Loki log field.',
      parameters: {
        fieldName: { type: 'string', required: true, description: 'Detected field name, for example level' },
        query: { type: 'string', required: true, description: 'LogQL stream selector, for example {job="app"}' },
        start: { type: 'string', description: 'Optional start time as Unix nanoseconds or RFC 3339' },
        end: { type: 'string', description: 'Optional end time as Unix nanoseconds or RFC 3339' },
        since: { type: 'string', description: 'Optional relative time range, for example 1h' },
        step: { type: 'string', description: 'Optional step between sample windows' },
        lineLimit: { type: 'integer', description: 'Maximum log lines to scan per shard, default 100' },
        limit: { type: 'integer', description: 'Maximum values to return, default 1000' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' },
          },
        },
        render: (_args, value) => renderLokiStrings(value, 'No values found for this detected field.'),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Loki field ${args.fieldName}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Loki unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} value(s)` }
      },
      async execute(args, exec) {
        if (!client.hasLoki()) return unavailable('Loki base URL is not configured.')
        return client.lokiGetDetectedFieldValues(args.fieldName as string, args.query as string, {
          start: args.start,
          end: args.end,
          since: args.since,
          step: args.step,
          lineLimit: args.lineLimit,
          limit: args.limit,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_health',
      description: 'Get Grafana health, database status, version, and commit information.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            database: { type: 'string' },
            version: { type: 'string' },
            commit: { type: 'string' },
            statusJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaHealth(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana health', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; version?: string }
        return { card: 'generic', title: v.connected ? `Grafana ${v.version ?? ''}` : 'Grafana unavailable' }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetHealth({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_datasources',
      description: 'List Grafana datasources with safe connection metadata and URL.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDatasourceItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDatasources(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana datasources', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} datasource(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListDatasources({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_datasource',
      description: 'Get one Grafana datasource by UID with safe connection metadata.',
      parameters: {
        uid: { type: 'string', required: true, description: 'Grafana datasource UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaDatasourceItemSchema,
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDatasource(value.item)
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana datasource ${args.uid}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        return { card: 'generic', title: v.connected ? `Datasource ${v.item?.name ?? ''}` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetDatasource(args.uid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_search_dashboards',
      description: 'Search Grafana dashboards by query, tag, starred status, limit, and page.',
      parameters: {
        query: { type: 'string', description: 'Optional dashboard title search query' },
        tag: { type: 'string', description: 'Optional dashboard tag filter' },
        starred: { type: 'boolean', description: 'Optional flag to return only starred dashboards' },
        limit: { type: 'integer', description: 'Maximum results, default 1000' },
        page: { type: 'integer', description: 'Page number for results beyond the limit' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDashboardSummaryItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDashboards(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana dashboards ${args.query ?? ''}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} dashboard(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaSearchDashboards({
          query: args.query,
          tag: args.tag,
          starred: args.starred,
          limit: args.limit,
          page: args.page,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_dashboard',
      description: 'Get a full Grafana dashboard by UID with panel count and dashboard JSON.',
      parameters: {
        uid: { type: 'string', required: true, description: 'Grafana dashboard UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            uid: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string' },
            panelCount: { type: 'number' },
            dashboardJson: { type: 'string' },
            metaJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaDashboard(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana dashboard ${args.uid}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; title?: string; panelCount?: number }
        return { card: 'generic', title: v.connected ? `${v.title ?? ''} (${v.panelCount ?? 0} panels)` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetDashboard(args.uid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_folders',
      description: 'List Grafana folders with UID, title, and URL.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaFolderItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaFolders(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana folders', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} folder(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListFolders({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_annotations',
      description: 'List Grafana annotations filtered by time, dashboard, panel, type, and tags.',
      parameters: {
        from: { type: 'string', description: 'Start time as epoch milliseconds' },
        to: { type: 'string', description: 'End time as epoch milliseconds' },
        limit: { type: 'integer', description: 'Maximum annotations, default 100' },
        dashboardUid: { type: 'string', description: 'Optional dashboard UID filter' },
        panelId: { type: 'number', description: 'Optional panel ID filter' },
        type: { type: 'string', enum: ['alert', 'annotation'], description: 'Optional annotation type filter' },
        tagsJson: { type: 'string', description: 'Optional JSON array of annotation tags, for example ["prod"]' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAnnotationItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAnnotations(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana annotations', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} annotation(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        const tags = args.tagsJson
          ? parseJsonArray(args.tagsJson)
          : { ok: true, value: undefined }
        if (!tags.ok) return unavailable('tagsJson must be a valid JSON array.')
        if (tags.value?.some(tag => typeof tag !== 'string')) {
          return unavailable('tagsJson must contain string tags.')
        }
        return client.grafanaListAnnotations({
          from: args.from,
          to: args.to,
          limit: args.limit,
          dashboardUid: args.dashboardUid,
          panelId: args.panelId,
          type: args.type,
          tags: (tags.value ?? []) as string[],
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_alert_instances',
      description: 'List current Grafana-managed alert instances through the Alertmanager-compatible API.',
      parameters: {
        active: { type: 'boolean', description: 'Optional filter to exclude inactive alerts when false' },
        silenced: { type: 'boolean', description: 'Optional filter to exclude silenced alerts when false' },
        inhibited: { type: 'boolean', description: 'Optional filter to exclude inhibited alerts when false' },
        receiver: { type: 'string', description: 'Optional receiver name filter' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAlertInstanceItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAlertInstances(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana alert instances', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} alert instance(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListAlertInstances({
          active: args.active,
          silenced: args.silenced,
          inhibited: args.inhibited,
          receiver: args.receiver,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_alert_rules',
      description: 'List Grafana-managed alert rules with folder, rule group, condition, state settings, and labels.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAlertRuleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAlertRules(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana alert rules', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} alert rule(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListAlertRules({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_alert_rule',
      description: 'Get one Grafana alert rule by UID with condition, data query JSON, labels, and annotations.',
      parameters: {
        uid: { type: 'string', required: true, description: 'Grafana alert rule UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaAlertRuleItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaAlertRule(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana alert rule ${args.uid}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { title?: string } }
        return { card: 'generic', title: v.connected ? `Alert rule ${v.item?.title ?? ''}` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetAlertRule(args.uid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_contact_points',
      description: 'List Grafana contact points with type, safe settings metadata, and resolve message behavior.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaContactPointItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaContactPoints(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana contact points', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} contact point(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListContactPoints({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_notification_policy',
      description: 'Get the current Grafana notification policy tree with receiver, grouping, and routing intervals.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            receiver: { type: 'string' },
            groupByJson: { type: 'string' },
            groupWait: { type: 'string' },
            groupInterval: { type: 'string' },
            repeatInterval: { type: 'string' },
            policyJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaNotificationPolicy(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana notification policy', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; receiver?: string }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: v.receiver ? `Policy receiver ${v.receiver}` : 'Notification policy' }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetNotificationPolicy({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_teams',
      description: 'Search Grafana teams by query, exact name, sort, and pagination.',
      parameters: {
        query: { type: 'string', description: 'Optional team name query' },
        name: { type: 'string', description: 'Optional exact team name filter' },
        sort: { type: 'string', description: 'Optional sort option, for example memberCount-desc' },
        page: { type: 'integer', description: 'Page number, default 1' },
        perPage: { type: 'integer', description: 'Teams per page, default 1000' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            totalCount: { type: 'number' },
            page: { type: 'number' },
            perPage: { type: 'number' },
            items: { type: 'array', items: grafanaTeamItemSchema },
          },
        },
        render: (_args, value) => renderGrafanaTeams(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana teams ${args.query ?? args.name ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; totalCount?: number; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${v.totalCount ?? (v.items ?? []).length} team(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListTeams({
          query: args.query,
          name: args.name,
          sort: args.sort,
          page: args.page,
          perPage: args.perPage,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_team',
      description: 'Get one Grafana team by ID with organization, member count, and timestamps.',
      parameters: {
        teamId: { type: 'integer', required: true, description: 'Grafana team ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaTeamItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaTeam(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana team ${args.teamId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        return { card: 'generic', title: v.connected ? `Team ${v.item?.name ?? ''}` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetTeam(args.teamId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_team_members',
      description: 'List members of one Grafana team by team ID.',
      parameters: {
        teamId: { type: 'integer', required: true, description: 'Grafana team ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaTeamMemberItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaTeamMembers(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana team members ${args.teamId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} member(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListTeamMembers(args.teamId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_org_users',
      description: 'List users in the current Grafana organization with roles and last seen information.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaOrgUserItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaOrgUsers(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana org users', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} org user(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListOrgUsers({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_orgs',
      description: 'List Grafana organizations visible to the current API token with id, name, and timestamps.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            totalCount: { type: 'number' },
            items: { type: 'array', items: grafanaOrgItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaOrgs(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana orgs', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; totalCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${v.totalCount ?? 0} org(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListOrgs({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_org',
      description: 'Get one Grafana organization by ID with name, address, and timestamps.',
      parameters: {
        orgId: { type: 'integer', required: true, description: 'Grafana organization ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'number' },
            name: { type: 'string' },
            addressJson: { type: 'string' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            orgJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaOrg(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana org ${args.orgId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; name?: string }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Org ${v.name ?? ''}` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetOrg(args.orgId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_org_users_by_org',
      description: 'List users in one Grafana organization by organization ID with roles and last seen information.',
      parameters: {
        orgId: { type: 'integer', required: true, description: 'Grafana organization ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaOrgUserItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaOrgUsers(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana org users ${args.orgId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} org user(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListOrgUsersByOrg(args.orgId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_service_accounts',
      description: 'Search Grafana service accounts by query and pagination, with role, token count, and access control metadata.',
      parameters: {
        query: { type: 'string', description: 'Optional service account name query' },
        page: { type: 'integer', description: 'Page number, default 1' },
        perPage: { type: 'integer', description: 'Service accounts per page, default 1000' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            totalCount: { type: 'number' },
            page: { type: 'number' },
            perPage: { type: 'number' },
            items: { type: 'array', items: grafanaServiceAccountItemSchema },
          },
        },
        render: (_args, value) => renderGrafanaServiceAccounts(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana service accounts ${args.query ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; totalCount?: number; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${v.totalCount ?? (v.items ?? []).length} service account(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListServiceAccounts({
          query: args.query,
          page: args.page,
          perPage: args.perPage,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_service_account',
      description: 'Get one Grafana service account by ID with role, token count, and access control metadata.',
      parameters: {
        serviceAccountId: { type: 'integer', required: true, description: 'Grafana service account ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaServiceAccountItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaServiceAccount(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana service account ${args.serviceAccountId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        return { card: 'generic', title: v.connected ? `Service account ${v.item?.name ?? ''}` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetServiceAccount(args.serviceAccountId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_service_account_tokens',
      description: 'List tokens for one Grafana service account with creation, expiration, and expired state.',
      parameters: {
        serviceAccountId: { type: 'integer', required: true, description: 'Grafana service account ID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaServiceAccountTokenItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaServiceAccountTokens(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana service account tokens ${args.serviceAccountId}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} token(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListServiceAccountTokens(args.serviceAccountId as number, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_org_quotas',
      description: 'List current Grafana organization quotas with target, limit, and used values.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaOrgQuotaItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaOrgQuotas(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana org quotas', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} quota(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListOrgQuotas({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_folder_permissions',
      description: 'List permissions for one Grafana folder by UID, including user, team, and built-in role grants.',
      parameters: {
        folderUid: { type: 'string', required: true, description: 'Grafana folder UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaFolderPermissionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaFolderPermissions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana folder permissions ${args.folderUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} permission(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListFolderPermissions(args.folderUid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_datasource_permissions',
      description: 'List permissions for one Grafana datasource by UID, including user, team, built-in role, and actions.',
      parameters: {
        datasourceUid: { type: 'string', required: true, description: 'Grafana datasource UID' },
        dsType: { type: 'string', description: 'Optional datasource type to disambiguate duplicate UIDs' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDatasourcePermissionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDatasourcePermissions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana datasource permissions ${args.datasourceUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} permission(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListDatasourcePermissions(args.datasourceUid as string, {
          dsType: args.dsType,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_dashboard_permissions',
      description: 'List permissions for one Grafana dashboard by UID, including user, team, and built-in role grants.',
      parameters: {
        dashboardUid: { type: 'string', required: true, description: 'Grafana dashboard UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDashboardPermissionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDashboardPermissions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana dashboard permissions ${args.dashboardUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} permission(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListDashboardPermissions(args.dashboardUid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_access_control_roles',
      description: 'List Grafana access control roles with version, display name, group, and global state, optionally including hidden roles.',
      parameters: {
        includeHidden: { type: 'boolean', description: 'Include hidden roles when true' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAccessControlRoleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAccessControlRoles(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana access control roles', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} role(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListAccessControlRoles({
          includeHidden: args.includeHidden,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_access_control_role',
      description: 'Get one Grafana access control role by UID with permissions, scopes, version, and timestamps.',
      parameters: {
        roleUid: { type: 'string', required: true, description: 'Grafana access control role UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaAccessControlRoleItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaAccessControlRole(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana access control role ${args.roleUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        return { card: 'generic', title: v.connected ? `Role ${v.item?.name ?? ''}` : 'Grafana unavailable' }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetAccessControlRole(args.roleUid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_builtin_roles',
      description: 'List Grafana built-in roles with their assigned permissions.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaBuiltinRoleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaBuiltinRoles(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana built-in roles', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} built-in role(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListBuiltinRoles({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_builtin_role',
      description: 'Get one Grafana built-in role with its assigned permissions.',
      parameters: {
        builtInRole: {
          type: 'string',
          required: true,
          description: 'Grafana built-in role name, for example Viewer, Editor, Admin, or Grafana Admin',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaBuiltinRoleItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaBuiltinRole(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana built-in role ${args.builtInRole ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { role?: string } }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Built-in role ${v.item?.role ?? ''}` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetBuiltinRole(args.builtInRole as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_user_roles',
      description: 'List Grafana access control roles directly assigned to one user.',
      parameters: {
        userId: { type: 'integer', required: true, description: 'Grafana user ID' },
        includeHidden: { type: 'boolean', description: 'Include hidden roles when true' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            userId: { type: 'number' },
            items: { type: 'array', items: grafanaAccessControlRoleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAccessControlRoles(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana user roles ${args.userId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} role(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListUserRoles(args.userId as number, {
          includeHidden: args.includeHidden,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_team_roles',
      description: 'List Grafana access control roles directly assigned to one team.',
      parameters: {
        teamId: { type: 'integer', required: true, description: 'Grafana team ID' },
        includeHidden: { type: 'boolean', description: 'Include hidden roles when true' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            teamId: { type: 'number' },
            items: { type: 'array', items: grafanaAccessControlRoleItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAccessControlRoles(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana team roles ${args.teamId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} role(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListTeamRoles(args.teamId as number, {
          includeHidden: args.includeHidden,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_admin_stats',
      description: 'Get Grafana admin stats covering users, orgs, dashboards, snapshots, datasources, playlists, stars, alerts, and active session counts.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            users: { type: 'number' },
            orgs: { type: 'number' },
            dashboards: { type: 'number' },
            snapshots: { type: 'number' },
            tags: { type: 'number' },
            datasources: { type: 'number' },
            playlists: { type: 'number' },
            stars: { type: 'number' },
            alerts: { type: 'number' },
            activeAdmins: { type: 'number' },
            activeEditors: { type: 'number' },
            activeViewers: { type: 'number' },
            activeUsers: { type: 'number' },
            activeSessions: { type: 'number' },
            statsJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaAdminStats(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana admin stats', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; users?: number; dashboards?: number }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${v.users ?? 0} user(s), ${v.dashboards ?? 0} dashboard(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetAdminStats({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_plugins',
      description: 'List Grafana plugins with type, version, enabled state, update availability, and signature state.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaPluginItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaPlugins(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana plugins', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} plugin(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListPlugins({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_dashboard_versions',
      description: 'List version history for one Grafana dashboard by UID, including author, message, timestamps, and parent version.',
      parameters: {
        dashboardUid: { type: 'string', required: true, description: 'Grafana dashboard UID' },
        limit: { type: 'integer', description: 'Maximum versions, default returned by Grafana' },
        start: { type: 'integer', description: 'Zero-based start offset for pagination' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDashboardVersionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDashboardVersions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana dashboard versions ${args.dashboardUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} version(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListDashboardVersions(args.dashboardUid as string, {
          limit: args.limit,
          start: args.start,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_dashboard_snapshots',
      description: 'List Grafana dashboard snapshots with name, key, owner, external state, and expiration.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaDashboardSnapshotItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaDashboardSnapshots(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana dashboard snapshots', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} snapshot(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListDashboardSnapshots({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_access_control_user_permissions',
      description: 'List effective Grafana access control permissions for one user by user ID, optionally filtered by scope.',
      parameters: {
        userId: { type: 'integer', required: true, description: 'Grafana user ID' },
        scope: { type: 'string', description: 'Optional scope filter for permission entries' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAccessControlPermissionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAccessControlPermissions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana user permissions ${args.userId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} permission(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListAccessControlUserPermissions(args.userId as number, {
          scope: args.scope,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_list_access_control_team_permissions',
      description: 'List effective Grafana access control permissions for one team by team ID, optionally filtered by scope.',
      parameters: {
        teamId: { type: 'integer', required: true, description: 'Grafana team ID' },
        scope: { type: 'string', description: 'Optional scope filter for permission entries' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaAccessControlPermissionItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaAccessControlPermissions(value.items ?? [])
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana team permissions ${args.teamId ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} permission(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListAccessControlTeamPermissions(args.teamId as number, {
          scope: args.scope,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_org_preferences',
      description: 'Get current Grafana organization preferences including theme, home dashboard UID, timezone, and week start.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            theme: { type: 'string' },
            homeDashboardUid: { type: 'string' },
            timezone: { type: 'string' },
            weekStart: { type: 'string' },
            prefsJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaOrgPreferences(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana org preferences', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; theme?: string }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Org theme ${v.theme ?? ''}` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetOrgPreferences({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_current_user',
      description: 'Get the current Grafana user profile with login, email, organization, admin flags, and authentication labels.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'number' },
            login: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
            orgId: { type: 'number' },
            isGrafanaAdmin: { type: 'boolean' },
            isDisabled: { type: 'boolean' },
            isExternal: { type: 'boolean' },
            updatedAt: { type: 'string' },
            createdAt: { type: 'string' },
            theme: { type: 'string' },
            authLabelsJson: { type: 'string' },
            userJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaCurrentUser(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana current user', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; login?: string }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `User ${v.login ?? ''}` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetCurrentUser({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_current_user_orgs',
      description: 'List Grafana organizations available to the current user with role membership.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaUserOrgItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaUserOrgs(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana current user orgs', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} org(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListCurrentUserOrgs({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_library_elements',
      description: 'Search Grafana library panels and variables with name, type, kind, and pagination filters.',
      parameters: {
        searchString: { type: 'string', description: 'Optional library element name search text' },
        type: { type: 'string', description: 'Optional library element type filter, for example timeseries' },
        kind: { type: 'string', description: 'Optional library element kind filter, for example panel' },
        perPage: { type: 'integer', description: 'Elements per page, default Grafana value' },
        page: { type: 'integer', description: 'Page number, default 1' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            totalCount: { type: 'number' },
            page: { type: 'number' },
            perPage: { type: 'number' },
            items: { type: 'array', items: grafanaLibraryElementItemSchema },
          },
        },
        render: (_args, value) => renderGrafanaLibraryElements(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana library elements ${args.searchString ?? ''}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[]; totalCount?: number }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${v.totalCount ?? (v.items ?? []).length} element(s)` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListLibraryElements({
          searchString: args.searchString,
          type: args.type,
          kind: args.kind,
          perPage: args.perPage,
          page: args.page,
          signal: exec.signal,
        })
      },
    }),

    defineTool({
      name: 'grafana_get_library_element',
      description: 'Get one Grafana library element by UID with name, kind, type, model, and metadata.',
      parameters: {
        libraryElementUid: { type: 'string', required: true, description: 'Grafana library element UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaLibraryElementItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaLibraryElement(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana library element ${args.libraryElementUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Library element ${v.item?.name ?? ''}` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetLibraryElement(args.libraryElementUid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_list_playlists',
      description: 'List Grafana playlists with UID, name, interval, and timestamps.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            items: { type: 'array', items: grafanaPlaylistItemSchema },
          },
        },
        render: (_args, value) => {
          if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
          return renderGrafanaPlaylists(value.items ?? [])
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana playlists', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; items?: unknown[] }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `${(v.items ?? []).length} playlist(s)` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaListPlaylists({ signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_playlist',
      description: 'Get one Grafana playlist by UID with interval and playlist items.',
      parameters: {
        playlistUid: { type: 'string', required: true, description: 'Grafana playlist UID' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            item: grafanaPlaylistDetailItemSchema,
          },
        },
        render: (_args, value) => renderGrafanaPlaylist(value),
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Grafana playlist ${args.playlistUid ?? ''}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; item?: { name?: string } }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Playlist ${v.item?.name ?? ''}` }
      },
      async execute(args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetPlaylist(args.playlistUid as string, { signal: exec.signal })
      },
    }),

    defineTool({
      name: 'grafana_get_current_org',
      description: 'Get the current Grafana organization profile with name and address details.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            connected: { type: 'boolean' },
            reason: { type: 'string' },
            id: { type: 'number' },
            name: { type: 'string' },
            addressJson: { type: 'string' },
            orgJson: { type: 'string' },
          },
        },
        render: (_args, value) => renderGrafanaCurrentOrg(value),
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Grafana current org', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { connected?: boolean; name?: string }
        if (!v.connected) return { card: 'generic', title: 'Grafana unavailable' }
        return { card: 'generic', title: `Org ${v.name ?? ''}` }
      },
      async execute(_args, exec) {
        if (!client.hasGrafana()) return unavailable('Grafana base URL is not configured.')
        return client.grafanaGetCurrentOrg({ signal: exec.signal })
      },
    }),
  ]
}

const lokiSeriesItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    labelsJson: { type: 'string' },
  },
} as const

const lokiRuleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    group: { type: 'string' },
    file: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    health: { type: 'string' },
    lastError: { type: 'string' },
    query: { type: 'string' },
    duration: { type: 'string' },
    labelsJson: { type: 'string' },
    annotationsJson: { type: 'string' },
    activeAlertCount: { type: 'number' },
  },
} as const

const lokiPatternItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pattern: { type: 'string' },
    sampleCount: { type: 'number' },
    totalCount: { type: 'number' },
    samplesJson: { type: 'string' },
  },
} as const

const lokiDetectedFieldItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    type: { type: 'string' },
    cardinality: { type: 'number' },
    parsersJson: { type: 'string' },
    jsonPath: { type: 'string' },
  },
} as const

const grafanaDatasourceItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    uid: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    url: { type: 'string' },
    access: { type: 'string' },
    isDefault: { type: 'boolean' },
    basicAuth: { type: 'boolean' },
    withCredentials: { type: 'boolean' },
    database: { type: 'string' },
    user: { type: 'string' },
    settingsJson: { type: 'string' },
  },
} as const

const grafanaDashboardSummaryItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    uid: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
    type: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    isStarred: { type: 'boolean' },
    folderUid: { type: 'string' },
    folderTitle: { type: 'string' },
  },
} as const

const grafanaFolderItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    uid: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string' },
  },
} as const

const grafanaAnnotationItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    alertId: { type: 'number' },
    dashboardUid: { type: 'string' },
    panelId: { type: 'number' },
    userName: { type: 'string' },
    newState: { type: 'string' },
    prevState: { type: 'string' },
    time: { type: 'number' },
    timeEnd: { type: 'number' },
    text: { type: 'string' },
    tagsJson: { type: 'string' },
    dataJson: { type: 'string' },
  },
} as const

const grafanaAlertInstanceItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fingerprint: { type: 'string' },
    startsAt: { type: 'string' },
    endsAt: { type: 'string' },
    statusJson: { type: 'string' },
    labelsJson: { type: 'string' },
    annotationsJson: { type: 'string' },
    receiversJson: { type: 'string' },
  },
} as const

const grafanaAlertRuleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    uid: { type: 'string' },
    title: { type: 'string' },
    folderUid: { type: 'string' },
    namespaceUid: { type: 'string' },
    dashboardUid: { type: 'string' },
    panelId: { type: 'number' },
    ruleGroup: { type: 'string' },
    condition: { type: 'string' },
    dataJson: { type: 'string' },
    noDataState: { type: 'string' },
    execErrState: { type: 'string' },
    duration: { type: 'string' },
    intervalSeconds: { type: 'number' },
    paused: { type: 'boolean' },
    updated: { type: 'string' },
    version: { type: 'number' },
    labelsJson: { type: 'string' },
    annotationsJson: { type: 'string' },
    ruleJson: { type: 'string' },
  },
} as const

const grafanaContactPointItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    settingsJson: { type: 'string' },
    disableResolveMessage: { type: 'boolean' },
  },
} as const

const grafanaTeamItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    orgId: { type: 'number' },
    name: { type: 'string' },
    email: { type: 'string' },
    avatarUrl: { type: 'string' },
    memberCount: { type: 'number' },
    permission: { type: 'number' },
    created: { type: 'string' },
    updated: { type: 'string' },
  },
} as const

const grafanaTeamMemberItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    orgId: { type: 'number' },
    teamId: { type: 'number' },
    userId: { type: 'number' },
    email: { type: 'string' },
    login: { type: 'string' },
    name: { type: 'string' },
    avatarUrl: { type: 'string' },
  },
} as const

const grafanaOrgItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const

const grafanaOrgUserItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    orgId: { type: 'number' },
    userId: { type: 'number' },
    email: { type: 'string' },
    login: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
    isExternal: { type: 'boolean' },
    lastSeenAt: { type: 'string' },
    lastSeenAtAge: { type: 'string' },
  },
} as const

const grafanaServiceAccountItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    login: { type: 'string' },
    orgId: { type: 'number' },
    isDisabled: { type: 'boolean' },
    role: { type: 'string' },
    tokens: { type: 'number' },
    avatarUrl: { type: 'string' },
    accessControlJson: { type: 'string' },
  },
} as const

const grafanaServiceAccountTokenItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    role: { type: 'string' },
    created: { type: 'string' },
    expiration: { type: 'string' },
    secondsUntilExpiration: { type: 'number' },
    hasExpired: { type: 'boolean' },
  },
} as const

const grafanaOrgQuotaItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    orgId: { type: 'number' },
    target: { type: 'string' },
    limit: { type: 'number' },
    used: { type: 'number' },
  },
} as const

const grafanaFolderPermissionItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    folderId: { type: 'number' },
    role: { type: 'string' },
    permission: { type: 'number' },
    permissionName: { type: 'string' },
    userId: { type: 'number' },
    userLogin: { type: 'string' },
    userEmail: { type: 'string' },
    teamId: { type: 'number' },
    team: { type: 'string' },
  },
} as const

const grafanaDatasourcePermissionItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    roleName: { type: 'string' },
    isManaged: { type: 'boolean' },
    isInherited: { type: 'boolean' },
    isServiceAccount: { type: 'boolean' },
    userId: { type: 'number' },
    userLogin: { type: 'string' },
    userAvatarUrl: { type: 'string' },
    teamId: { type: 'number' },
    team: { type: 'string' },
    teamAvatarUrl: { type: 'string' },
    builtInRole: { type: 'string' },
    actionsJson: { type: 'string' },
    permission: { type: 'string' },
  },
} as const

const grafanaDashboardPermissionItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    dashboardId: { type: 'number' },
    created: { type: 'string' },
    updated: { type: 'string' },
    userId: { type: 'number' },
    userLogin: { type: 'string' },
    userEmail: { type: 'string' },
    teamId: { type: 'number' },
    team: { type: 'string' },
    role: { type: 'string' },
    permission: { type: 'number' },
    permissionName: { type: 'string' },
    uid: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    isFolder: { type: 'boolean' },
    url: { type: 'string' },
  },
} as const

const grafanaAccessControlRoleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'number' },
    uid: { type: 'string' },
    name: { type: 'string' },
    displayName: { type: 'string' },
    description: { type: 'string' },
    group: { type: 'string' },
    hidden: { type: 'boolean' },
    updated: { type: 'string' },
    created: { type: 'string' },
    global: { type: 'boolean' },
    permissionsJson: { type: 'string' },
  },
} as const

const grafanaBuiltinRoleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: { type: 'string' },
    permissionsJson: { type: 'string' },
  },
} as const

const grafanaPluginItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    name: { type: 'string' },
    version: { type: 'string' },
    enabled: { type: 'boolean' },
    pinned: { type: 'boolean' },
    hasUpdate: { type: 'boolean' },
    state: { type: 'string' },
    signature: { type: 'string' },
    infoJson: { type: 'string' },
  },
} as const

const grafanaDashboardVersionItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    dashboardId: { type: 'number' },
    version: { type: 'number' },
    parentVersion: { type: 'number' },
    description: { type: 'string' },
    message: { type: 'string' },
    created: { type: 'string' },
    updated: { type: 'string' },
    createdBy: { type: 'string' },
    updatedBy: { type: 'string' },
  },
} as const

const grafanaDashboardSnapshotItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    key: { type: 'string' },
    orgId: { type: 'number' },
    userId: { type: 'number' },
    external: { type: 'boolean' },
    externalUrl: { type: 'string' },
    expires: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const

const grafanaAccessControlPermissionItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string' },
    scope: { type: 'string' },
  },
} as const

const grafanaUserOrgItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    orgId: { type: 'number' },
    name: { type: 'string' },
    role: { type: 'string' },
  },
} as const

const grafanaLibraryElementItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    orgId: { type: 'number' },
    folderId: { type: 'number' },
    uid: { type: 'string' },
    name: { type: 'string' },
    kind: { type: 'number' },
    type: { type: 'string' },
    description: { type: 'string' },
    version: { type: 'number' },
    created: { type: 'string' },
    updated: { type: 'string' },
    modelJson: { type: 'string' },
    metaJson: { type: 'string' },
  },
} as const

const grafanaPlaylistItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    uid: { type: 'string' },
    name: { type: 'string' },
    interval: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const

const grafanaPlaylistDetailItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'number' },
    uid: { type: 'string' },
    name: { type: 'string' },
    interval: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    itemsJson: { type: 'string' },
  },
} as const

const targetItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scrapeUrl: { type: 'string' },
    health: { type: 'string' },
    lastError: { type: 'string' },
    labelsJson: { type: 'string' },
  },
} as const

const prometheusAlertItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    state: { type: 'string' },
    value: { type: 'string' },
    activeAt: { type: 'string' },
    labelsJson: { type: 'string' },
    annotationsJson: { type: 'string' },
  },
} as const

const prometheusRuleItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    type: { type: 'string' },
    health: { type: 'string' },
    query: { type: 'string' },
    duration: { type: 'string' },
    labelsJson: { type: 'string' },
    activeAlertCount: { type: 'number' },
  },
} as const

const prometheusMetadataItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    metric: { type: 'string' },
    type: { type: 'string' },
    help: { type: 'string' },
    unit: { type: 'string' },
  },
} as const

const prometheusAlertmanagerItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string' },
    state: { type: 'string' },
    labelsJson: { type: 'string' },
  },
} as const

const alertmanagerAlertItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fingerprint: { type: 'string' },
    startsAt: { type: 'string' },
    endsAt: { type: 'string' },
    statusJson: { type: 'string' },
    labelsJson: { type: 'string' },
    annotationsJson: { type: 'string' },
    receiversJson: { type: 'string' },
  },
} as const

const alertmanagerGroupItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    receiver: { type: 'string' },
    labelsJson: { type: 'string' },
    alertCount: { type: 'number' },
    alertsJson: { type: 'string' },
  },
} as const

const alertmanagerSilenceItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    createdBy: { type: 'string' },
    comment: { type: 'string' },
    startsAt: { type: 'string' },
    endsAt: { type: 'string' },
    matchersJson: { type: 'string' },
    statusJson: { type: 'string' },
  },
} as const

interface JsonParseResult<T> {
  ok: boolean
  value?: T
  reason?: string
}

function parseJsonArray(value: string | undefined): JsonParseResult<unknown[]> {
  if (value === undefined || value.trim() === '') return { ok: false, reason: 'Expected a JSON array.' }
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return { ok: true, value: parsed }
    return { ok: false, reason: 'Expected a JSON array.' }
  } catch {
    return { ok: false, reason: 'Expected a valid JSON array.' }
  }
}

function isValidMatcher(value: unknown): boolean {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  return Boolean(record && typeof record.name === 'string' && typeof record.value === 'string')
}

function isValidAlert(value: unknown): boolean {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  return Boolean(record && record.labels && typeof record.labels === 'object' && !Array.isArray(record.labels))
}

function unavailable(reason: string) {
  return { connected: false, reason }
}

function text(textValue: string) {
  return [{ type: 'text' as const, text: textValue }]
}

function renderQuery(value: { connected?: boolean; reason?: string; resultType?: string; seriesCount?: number; resultJson?: string }) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(`${value.resultType ?? 'unknown'} (${value.seriesCount ?? 0} result(s))\n${value.resultJson ?? ''}`)
}

function renderPrometheusBuildInfo(value: Partial<PrometheusBuildInfoData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(`version: ${value.version ?? ''}\nrevision: ${value.revision ?? ''}\nbranch: ${value.branch ?? ''}\ngo: ${value.goVersion ?? ''}\nbuild user: ${value.buildUser ?? ''}\nbuild date: ${value.buildDate ?? ''}`)
}

function renderPrometheusRuntimeInfo(value: Partial<PrometheusRuntimeInfoData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(`start: ${value.startTime ?? ''}\ncwd: ${value.cwd ?? ''}\nlast config: ${value.lastConfigTime ?? ''}\nreload ok: ${value.reloadConfigSuccess ? 'yes' : 'no'}\ngoroutines: ${value.goroutineCount ?? 0}\ntime series: ${value.timeSeriesCount ?? 0}\n${value.runtimeJson ?? ''}`)
}

function renderPrometheusFlags(value: Partial<PrometheusFlagsData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(`count: ${value.count ?? 0}\n${value.flagsJson ?? ''}`)
}

function renderPrometheusMetadata(value: {
  connected?: boolean
  reason?: string
  items?: Array<Partial<PrometheusMetadataItem>>
}) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  if (!value.items?.length) return text('No Prometheus metric metadata found.')
  return text(value.items.map(item =>
    `${item.metric ?? ''} (${item.type ?? 'unknown'})${item.unit ? ` unit=${item.unit}` : ''}\n  ${item.help ?? ''}`,
  ).join('\n'))
}

function renderPrometheusAlertmanagers(value: {
  connected?: boolean
  reason?: string
  activeItems?: Array<Partial<PrometheusAlertmanagerItem>>
  droppedItems?: Array<Partial<PrometheusAlertmanagerItem>>
}) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  const active = value.activeItems ?? []
  const dropped = value.droppedItems ?? []
  const lines = [
    `active: ${active.length}`,
    ...active.map(item => `${item.url ?? ''} ${item.labelsJson ?? '{}'}`),
    `dropped: ${dropped.length}`,
    ...dropped.map(item => `${item.url ?? ''} ${item.labelsJson ?? '{}'}`),
  ]
  return text(lines.join('\n') || 'No Alertmanagers discovered.')
}

function renderPrometheusConfig(value: Partial<PrometheusConfigData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(value.configYaml ?? '')
}

function renderTargets(value: { items?: Array<Partial<PrometheusTargetItem>> }) {
  if (!value.items?.length) return text('No Prometheus scrape targets found.')
  return text(value.items.map(target =>
    `${target.health ?? 'unknown'} ${target.scrapeUrl ?? ''}${target.lastError ? ` ${target.lastError}` : ''}`,
  ).join('\n'))
}

function renderPrometheusAlerts(items: Array<Partial<PrometheusAlertItem>>) {
  if (!items.length) return text('No Prometheus alerts found.')
  return text(items.map(alert =>
    `${alert.state ?? 'unknown'} ${alert.labelsJson ?? '{}'} ${alert.value ?? ''}`,
  ).join('\n'))
}

function renderRules(items: Array<Partial<PrometheusRuleItem>>) {
  if (!items.length) return text('No Prometheus rules found.')
  return text(items.map(rule =>
    `${rule.type ?? 'unknown'} ${rule.name ?? ''} ${rule.health ?? ''} active=${rule.activeAlertCount ?? 0}`,
  ).join('\n'))
}

function renderStrings(value: { connected?: boolean; reason?: string; items?: string[] }, empty: string) {
  if (!value.connected) return text(value.reason ?? 'Prometheus is not configured.')
  return text(value.items?.length ? value.items.join(', ') : empty)
}

function renderAlertmanagerAlerts(items: Array<Partial<AlertmanagerAlertItem>>) {
  if (!items.length) return text('No Alertmanager alerts found.')
  return text(items.map(alert =>
    `${alert.labelsJson ?? '{}'} status=${alert.statusJson ?? '{}'} receiver=${alert.receiversJson ?? '[]'}`,
  ).join('\n'))
}

function renderAlertGroups(items: Array<Partial<AlertmanagerGroupItem>>) {
  if (!items.length) return text('No Alertmanager alert groups found.')
  return text(items.map(group =>
    `${group.receiver ?? ''} ${group.labelsJson ?? '{}'} alerts=${group.alertCount ?? 0}`,
  ).join('\n'))
}

function renderSilences(items: Array<Partial<AlertmanagerSilenceItem>>) {
  if (!items.length) return text('No Alertmanager silences found.')
  return text(items.map(silence =>
    `${silence.id ?? ''} ${silence.createdBy ?? ''} ${silence.matchersJson ?? '[]'} ${silence.startsAt ?? ''} -> ${silence.endsAt ?? ''} ${silence.comment ?? ''}`,
  ).join('\n'))
}

function renderLokiQuery(value: Partial<LokiQueryData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  return text(`${value.resultType ?? 'unknown'} (${value.seriesCount ?? 0} stream(s), ${value.entryCount ?? 0} entries)\n${value.resultJson ?? ''}`)
}

function renderLokiStrings(value: { connected?: boolean; reason?: string; items?: string[] }, empty: string) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  return text(value.items?.length ? value.items.join(', ') : empty)
}

function renderLokiSeries(items: Array<Partial<LokiSeriesItem>>) {
  if (!items.length) return text('No Loki streams found.')
  return text(items.map(item => item.labelsJson ?? '').join('\n'))
}

function renderLokiIndexStats(value: Partial<LokiIndexStats> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  return text(`streams: ${value.streams ?? 0}\nchunks: ${value.chunks ?? 0}\nentries: ${value.entries ?? 0}\nbytes: ${value.bytes ?? 0}\n${value.statsJson ?? ''}`)
}

function renderLokiStatus(value: Partial<LokiStatusData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  return text(`version: ${value.version ?? ''}\nrevision: ${value.revision ?? ''}\nbranch: ${value.branch ?? ''}\nbuildDate: ${value.buildDate ?? ''}\ngoVersion: ${value.goVersion ?? ''}\n${value.statusJson ?? ''}`)
}

function renderLokiRules(items: Array<Partial<LokiRuleItem>>) {
  if (!items.length) return text('No Loki rules found.')
  return text(items.map(rule =>
    `${rule.group ?? ''}/${rule.file ?? ''} ${rule.type ?? 'unknown'} ${rule.name ?? ''} health=${rule.health ?? ''} active=${rule.activeAlertCount ?? 0}`,
  ).join('\n'))
}

function renderLokiAlerts(items: Array<Partial<LokiAlertItem>>) {
  if (!items.length) return text('No Loki alerts found.')
  return text(items.map(alert =>
    `${alert.state ?? 'unknown'} ${alert.labelsJson ?? '{}'} ${alert.value ?? ''}`,
  ).join('\n'))
}

function renderLokiVolume(value: Partial<LokiVolumeData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  return text(`${value.resultType ?? 'unknown'} (${value.seriesCount ?? 0} series, ${value.totalBytes ?? 0} bytes)\n${value.resultJson ?? ''}`)
}

function renderLokiPatterns(items: Array<Partial<LokiPatternItem>>) {
  if (!items.length) return text('No Loki patterns found.')
  return text(items.map(pattern =>
    `${pattern.pattern ?? ''} samples=${pattern.sampleCount ?? 0} total=${pattern.totalCount ?? 0}`,
  ).join('\n'))
}

function renderLokiDetectedFields(value: { connected?: boolean; reason?: string; items?: Array<Partial<LokiDetectedFieldItem>>; limit?: number }) {
  if (!value.connected) return text(value.reason ?? 'Loki is not configured.')
  if (!value.items?.length) return text('No detected Loki fields found.')
  return text(value.items.map(field =>
    `${field.label ?? ''} ${field.type ?? ''} cardinality=${field.cardinality ?? 0} parsers=${field.parsersJson ?? '[]'}`,
  ).join('\n'))
}

function renderGrafanaHealth(value: Partial<GrafanaHealthData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`database: ${value.database ?? ''}\nversion: ${value.version ?? ''}\ncommit: ${value.commit ?? ''}\n${value.statusJson ?? ''}`)
}

function renderGrafanaDatasource(item?: Partial<GrafanaDatasourceItem>) {
  if (!item?.name) return text('No Grafana datasource found.')
  return text(`${item.name} (${item.type ?? 'unknown'})\nurl: ${item.url ?? ''}\naccess: ${item.access ?? ''}\ndefault: ${item.isDefault ? 'yes' : 'no'}`)
}

function renderGrafanaDatasources(items: Array<Partial<GrafanaDatasourceItem>>) {
  if (!items.length) return text('No Grafana datasources found.')
  return text(items.map(item =>
    `${item.name ?? ''} (${item.type ?? 'unknown'}) ${item.url ?? ''} default=${item.isDefault ? 'yes' : 'no'}`,
  ).join('\n'))
}

function renderGrafanaDashboards(items: Array<Partial<GrafanaDashboardSummaryItem>>) {
  if (!items.length) return text('No Grafana dashboards found.')
  return text(items.map(item =>
    `${item.title ?? ''} ${item.url ?? ''}${item.folderTitle ? ` folder=${item.folderTitle}` : ''}`,
  ).join('\n'))
}

function renderGrafanaDashboard(value: Partial<GrafanaDashboardData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`${value.title ?? ''} ${value.url ?? ''}\npanels: ${value.panelCount ?? 0}\n${value.dashboardJson ?? ''}`)
}

function renderGrafanaFolders(items: Array<Partial<GrafanaFolderItem>>) {
  if (!items.length) return text('No Grafana folders found.')
  return text(items.map(item => `${item.title ?? ''} ${item.url ?? ''}`).join('\n'))
}

function renderGrafanaAnnotations(items: Array<Partial<GrafanaAnnotationItem>>) {
  if (!items.length) return text('No Grafana annotations found.')
  return text(items.map(annotation =>
    `${annotation.time ?? 0} ${annotation.dashboardUid ?? ''} ${annotation.text ?? ''} ${annotation.tagsJson ?? '[]'}`,
  ).join('\n'))
}

function renderGrafanaAlertInstances(items: Array<Partial<GrafanaAlertInstanceItem>>) {
  if (!items.length) return text('No Grafana alert instances found.')
  return text(items.map(alert =>
    `${alert.labelsJson ?? '{}'} status=${alert.statusJson ?? '{}'} receiver=${alert.receiversJson ?? '[]'}`,
  ).join('\n'))
}

function renderGrafanaAlertRules(items: Array<Partial<GrafanaAlertRuleItem>>) {
  if (!items.length) return text('No Grafana alert rules found.')
  return text(items.map(rule =>
    `${rule.uid ?? ''} ${rule.title ?? ''} folder=${rule.folderUid ?? ''} group=${rule.ruleGroup ?? ''} condition=${rule.condition ?? ''} ${rule.paused ? 'paused' : 'active'}`,
  ).join('\n'))
}

function renderGrafanaAlertRule(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaAlertRuleItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.uid && !item?.title) return text('No Grafana alert rule found.')
  return text(`${item.title ?? ''} (${item.uid ?? ''})\nfolder: ${item.folderUid ?? ''}\ngroup: ${item.ruleGroup ?? ''}\nfor: ${item.duration ?? ''}\n${item.ruleJson ?? ''}`)
}

function renderGrafanaContactPoints(items: Array<Partial<GrafanaContactPointItem>>) {
  if (!items.length) return text('No Grafana contact points found.')
  return text(items.map(point =>
    `${point.name ?? ''} (${point.type ?? 'unknown'}) resolveMessage=${point.disableResolveMessage ? 'disabled' : 'enabled'}`,
  ).join('\n'))
}

function renderGrafanaNotificationPolicy(value: Partial<GrafanaNotificationPolicyData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`receiver: ${value.receiver ?? ''}\ngroupBy: ${value.groupByJson ?? '[]'}\ngroupWait: ${value.groupWait ?? ''}\ngroupInterval: ${value.groupInterval ?? ''}\nrepeatInterval: ${value.repeatInterval ?? ''}\n${value.policyJson ?? ''}`)
}

function renderGrafanaTeams(value: { connected?: boolean; reason?: string; totalCount?: number; page?: number; perPage?: number; items?: Array<Partial<GrafanaTeamItem>> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  if (!value.items?.length) return text('No Grafana teams found.')
  return text(value.items.map(team =>
    `${team.name ?? ''} (${team.id ?? 0}) members=${team.memberCount ?? 0} org=${team.orgId ?? 0}`,
  ).join('\n'))
}

function renderGrafanaTeam(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaTeamItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.id && !item?.name) return text('No Grafana team found.')
  return text(`${item.name ?? ''} (${item.id ?? 0})\norg: ${item.orgId ?? 0}\nemail: ${item.email ?? ''}\nmembers: ${item.memberCount ?? 0}`)
}

function renderGrafanaTeamMembers(items: Array<Partial<GrafanaTeamMemberItem>>) {
  if (!items.length) return text('No Grafana team members found.')
  return text(items.map(member =>
    `${member.login ?? ''} ${member.email ?? ''}${member.name ? ` ${member.name}` : ''}`,
  ).join('\n'))
}

function renderGrafanaOrgs(items: Array<Partial<GrafanaOrgItem>>) {
  if (!items.length) return text('No Grafana organizations found.')
  return text(items.map(org =>
    `${org.name ?? ''} (${org.id ?? 0}) created=${org.createdAt ?? ''} updated=${org.updatedAt ?? ''}`,
  ).join('\n'))
}

function renderGrafanaOrg(value: Partial<GrafanaOrgDetailData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  if (!value.id && !value.name) return text('No Grafana organization found.')
  return text(`id: ${value.id ?? 0}\nname: ${value.name ?? ''}\ncreated: ${value.createdAt ?? ''}\nupdated: ${value.updatedAt ?? ''}\naddress: ${value.addressJson ?? '{}'}\n${value.orgJson ?? '{}'}`)
}

function renderGrafanaOrgUsers(items: Array<Partial<GrafanaOrgUserItem>>) {
  if (!items.length) return text('No Grafana organization users found.')
  return text(items.map(user =>
    `${user.login ?? ''} ${user.email ?? ''} role=${user.role ?? 'unknown'} lastSeen=${user.lastSeenAtAge ?? ''}`,
  ).join('\n'))
}

function renderGrafanaServiceAccounts(value: { connected?: boolean; reason?: string; totalCount?: number; page?: number; perPage?: number; items?: Array<Partial<GrafanaServiceAccountItem>> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  if (!value.items?.length) return text('No Grafana service accounts found.')
  return text(value.items.map(account =>
    `${account.login ?? ''} ${account.name ?? ''} role=${account.role ?? 'unknown'} tokens=${account.tokens ?? 0} ${account.isDisabled ? 'disabled' : 'enabled'}`,
  ).join('\n'))
}

function renderGrafanaServiceAccount(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaServiceAccountItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.id && !item?.name) return text('No Grafana service account found.')
  return text(`${item.name ?? ''} (${item.id ?? 0})\nlogin: ${item.login ?? ''}\norg: ${item.orgId ?? 0}\nrole: ${item.role ?? ''}\ntokens: ${item.tokens ?? 0}\n${item.accessControlJson ?? '{}'}`)
}

function renderGrafanaServiceAccountTokens(items: Array<Partial<GrafanaServiceAccountTokenItem>>) {
  if (!items.length) return text('No Grafana service account tokens found.')
  return text(items.map(token =>
    `${token.name ?? ''} (${token.id ?? 0}) role=${token.role ?? ''} expired=${token.hasExpired ? 'yes' : 'no'} expiration=${token.expiration ?? ''}`,
  ).join('\n'))
}

function renderGrafanaOrgQuotas(items: Array<Partial<GrafanaOrgQuotaItem>>) {
  if (!items.length) return text('No Grafana organization quotas found.')
  return text(items.map(quota =>
    `${quota.target ?? ''} used=${quota.used ?? 0} limit=${quota.limit ?? 0}`,
  ).join('\n'))
}

function renderGrafanaFolderPermissions(items: Array<Partial<GrafanaFolderPermissionItem>>) {
  if (!items.length) return text('No Grafana folder permissions found.')
  return text(items.map(permission => {
    const principal = permission.userLogin
      ? `user=${permission.userLogin}`
      : permission.team
        ? `team=${permission.team}`
        : `role=${permission.role ?? 'unknown'}`
    return `${principal} permission=${permission.permissionName ?? permission.permission ?? 'unknown'}`
  }).join('\n'))
}

function renderGrafanaDatasourcePermissions(items: Array<Partial<GrafanaDatasourcePermissionItem>>) {
  if (!items.length) return text('No Grafana datasource permissions found.')
  return text(items.map(permission => {
    const principal = permission.userLogin
      ? `user=${permission.userLogin}`
      : permission.team
        ? `team=${permission.team}`
        : `role=${permission.builtInRole ?? permission.roleName ?? 'unknown'}`
    return `${principal} permission=${permission.permission ?? ''} managed=${permission.isManaged ? 'yes' : 'no'} inherited=${permission.isInherited ? 'yes' : 'no'} actions=${permission.actionsJson ?? '[]'}`
  }).join('\n'))
}

function renderGrafanaDashboardPermissions(items: Array<Partial<GrafanaDashboardPermissionItem>>) {
  if (!items.length) return text('No Grafana dashboard permissions found.')
  return text(items.map(permission => {
    const principal = permission.userLogin
      ? `user=${permission.userLogin}`
      : permission.team
        ? `team=${permission.team}`
        : `role=${permission.role ?? 'unknown'}`
    return `${principal} permission=${permission.permissionName ?? permission.permission ?? 'unknown'}`
  }).join('\n'))
}

function renderGrafanaAccessControlRoles(items: Array<Partial<GrafanaAccessControlRoleItem>>) {
  if (!items.length) return text('No Grafana access control roles found.')
  return text(items.map(role =>
    `${role.name ?? ''} ${role.displayName ?? ''} group=${role.group ?? ''} global=${role.global ? 'yes' : 'no'} version=${role.version ?? 0}`,
  ).join('\n'))
}

function renderGrafanaAccessControlRole(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaAccessControlRoleItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.uid && !item?.name) return text('No Grafana access control role found.')
  return text(`${item.name ?? ''} (${item.uid ?? ''})\ndisplayName: ${item.displayName ?? ''}\ngroup: ${item.group ?? ''}\nglobal: ${item.global ? 'yes' : 'no'}\nversion: ${item.version ?? 0}\n${item.permissionsJson ?? '{}'}`)
}

function renderGrafanaBuiltinRoles(items: Array<Partial<GrafanaBuiltinRoleItem>>) {
  if (!items.length) return text('No Grafana built-in roles found.')
  return text(items.map(role => `${role.role ?? ''}\n${role.permissionsJson ?? '{}'}`).join('\n\n'))
}

function renderGrafanaBuiltinRole(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaBuiltinRoleItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.role) return text('No Grafana built-in role found.')
  return text(`${item.role}\n${item.permissionsJson ?? '{}'}`)
}

function renderGrafanaAdminStats(value: Partial<GrafanaAdminStatsData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text([
    `users: ${value.users ?? 0}`,
    `orgs: ${value.orgs ?? 0}`,
    `dashboards: ${value.dashboards ?? 0}`,
    `snapshots: ${value.snapshots ?? 0}`,
    `datasources: ${value.datasources ?? 0}`,
    `playlists: ${value.playlists ?? 0}`,
    `stars: ${value.stars ?? 0}`,
    `alerts: ${value.alerts ?? 0}`,
    `active users: ${value.activeUsers ?? 0}`,
    `active sessions: ${value.activeSessions ?? 0}`,
    value.statsJson ?? '{}',
  ].join('\n'))
}

function renderGrafanaPlugins(items: Array<Partial<GrafanaPluginItem>>) {
  if (!items.length) return text('No Grafana plugins found.')
  return text(items.map(plugin =>
    `${plugin.id ?? ''} ${plugin.name ?? ''} ${plugin.version ?? ''} ${plugin.enabled ? 'enabled' : 'disabled'} update=${plugin.hasUpdate ? 'yes' : 'no'} signature=${plugin.signature ?? ''}`,
  ).join('\n'))
}

function renderGrafanaDashboardVersions(items: Array<Partial<GrafanaDashboardVersionItem>>) {
  if (!items.length) return text('No Grafana dashboard versions found.')
  return text(items.map(version =>
    `v${version.version ?? 0} ${version.createdBy ?? ''} ${version.created ?? ''} ${version.message ?? ''}`,
  ).join('\n'))
}

function renderGrafanaDashboardSnapshots(items: Array<Partial<GrafanaDashboardSnapshotItem>>) {
  if (!items.length) return text('No Grafana dashboard snapshots found.')
  return text(items.map(snapshot =>
    `${snapshot.name ?? ''} key=${snapshot.key ?? ''} owner=${snapshot.userId ?? 0} external=${snapshot.external ? 'yes' : 'no'} expires=${snapshot.expires ?? ''}`,
  ).join('\n'))
}

function renderGrafanaAccessControlPermissions(items: Array<Partial<GrafanaAccessControlPermissionItem>>) {
  if (!items.length) return text('No Grafana access control permissions found.')
  return text(items.map(permission =>
    `${permission.action ?? ''} ${permission.scope ?? ''}`,
  ).join('\n'))
}

function renderGrafanaOrgPreferences(value: Partial<GrafanaOrgPreferencesData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`theme: ${value.theme ?? ''}\nhomeDashboard: ${value.homeDashboardUid ?? ''}\ntimezone: ${value.timezone ?? ''}\nweekStart: ${value.weekStart ?? ''}\n${value.prefsJson ?? '{}'}`)
}

function renderGrafanaCurrentUser(value: Partial<GrafanaCurrentUserData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`login: ${value.login ?? ''}\nemail: ${value.email ?? ''}\nname: ${value.name ?? ''}\norg: ${value.orgId ?? 0}\nadmin: ${value.isGrafanaAdmin ? 'yes' : 'no'}\ndisabled: ${value.isDisabled ? 'yes' : 'no'}\n${value.userJson ?? '{}'}`)
}

function renderGrafanaUserOrgs(items: Array<Partial<GrafanaUserOrgItem>>) {
  if (!items.length) return text('No Grafana user organizations found.')
  return text(items.map(org =>
    `${org.name ?? ''} (${org.orgId ?? 0}) role=${org.role ?? 'unknown'}`,
  ).join('\n'))
}

function renderGrafanaLibraryElements(value: {
  connected?: boolean
  reason?: string
  totalCount?: number
  page?: number
  perPage?: number
  items?: Array<Partial<GrafanaLibraryElementItem>>
}) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  if (!value.items?.length) return text('No Grafana library elements found.')
  return text(value.items.map(element =>
    `${element.name ?? ''} (${element.uid ?? ''}) kind=${element.kind ?? 0} type=${element.type ?? ''} version=${element.version ?? 0}`,
  ).join('\n'))
}

function renderGrafanaLibraryElement(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaLibraryElementItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.uid && !item?.name) return text('No Grafana library element found.')
  return text(`${item.name ?? ''} (${item.uid ?? ''})\nkind: ${item.kind ?? 0}\ntype: ${item.type ?? ''}\nversion: ${item.version ?? 0}\n${item.modelJson ?? '{}'}`)
}

function renderGrafanaPlaylists(items: Array<Partial<GrafanaPlaylistItem>>) {
  if (!items.length) return text('No Grafana playlists found.')
  return text(items.map(playlist =>
    `${playlist.name ?? ''} (${playlist.uid ?? ''}) interval=${playlist.interval ?? ''}`,
  ).join('\n'))
}

function renderGrafanaPlaylist(value: { connected?: boolean; reason?: string; item?: Partial<GrafanaPlaylistDetailItem> }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  const item = value.item
  if (!item?.uid && !item?.name) return text('No Grafana playlist found.')
  return text(`${item.name ?? ''} (${item.uid ?? ''})\ninterval: ${item.interval ?? ''}\n${item.itemsJson ?? '[]'}`)
}

function renderGrafanaCurrentOrg(value: Partial<GrafanaCurrentOrgData> & { reason?: string }) {
  if (!value.connected) return text(value.reason ?? 'Grafana is not configured.')
  return text(`id: ${value.id ?? 0}\nname: ${value.name ?? ''}\naddress: ${value.addressJson ?? '{}'}\n${value.orgJson ?? '{}'}`)
}
