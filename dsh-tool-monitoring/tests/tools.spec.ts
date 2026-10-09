import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MonitoringClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function prom(body: unknown): Response {
  return json({ status: 'success', data: body })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

function tools(client = new MonitoringClient()) {
  return Object.fromEntries(createTools(client).map(tool => [tool.name, tool]))
}

describe('tool definitions', () => {
  it('registers the planned Prometheus and Alertmanager tool set', () => {
    expect(Object.keys(tools()).sort()).toEqual([
      'alertmanager_create_silence',
      'alertmanager_delete_silence',
      'alertmanager_get_status',
      'alertmanager_list_alert_groups',
      'alertmanager_list_alerts',
      'alertmanager_list_receivers',
      'alertmanager_list_silences',
      'alertmanager_send_alerts',
      'grafana_get_access_control_role',
      'grafana_get_admin_stats',
      'grafana_get_alert_rule',
      'grafana_get_builtin_role',
      'grafana_get_current_org',
      'grafana_get_current_user',
      'grafana_get_dashboard',
      'grafana_get_datasource',
      'grafana_get_health',
      'grafana_get_library_element',
      'grafana_get_notification_policy',
      'grafana_get_org',
      'grafana_get_org_preferences',
      'grafana_get_playlist',
      'grafana_get_service_account',
      'grafana_get_team',
      'grafana_list_access_control_roles',
      'grafana_list_access_control_team_permissions',
      'grafana_list_access_control_user_permissions',
      'grafana_list_alert_instances',
      'grafana_list_alert_rules',
      'grafana_list_annotations',
      'grafana_list_builtin_roles',
      'grafana_list_contact_points',
      'grafana_list_current_user_orgs',
      'grafana_list_dashboard_permissions',
      'grafana_list_dashboard_snapshots',
      'grafana_list_dashboard_versions',
      'grafana_list_datasource_permissions',
      'grafana_list_datasources',
      'grafana_list_folder_permissions',
      'grafana_list_folders',
      'grafana_list_library_elements',
      'grafana_list_org_quotas',
      'grafana_list_org_users',
      'grafana_list_org_users_by_org',
      'grafana_list_orgs',
      'grafana_list_playlists',
      'grafana_list_plugins',
      'grafana_list_service_account_tokens',
      'grafana_list_service_accounts',
      'grafana_list_team_members',
      'grafana_list_team_roles',
      'grafana_list_teams',
      'grafana_list_user_roles',
      'grafana_search_dashboards',
      'loki_get_detected_field_values',
      'loki_get_detected_fields',
      'loki_get_index_stats',
      'loki_get_index_volume',
      'loki_get_index_volume_range',
      'loki_get_label_values',
      'loki_get_patterns',
      'loki_get_status',
      'loki_list_alerts',
      'loki_list_labels',
      'loki_list_rule_groups',
      'loki_list_rules',
      'loki_list_series',
      'loki_query',
      'loki_query_range',
      'prometheus_delete_series',
      'prometheus_get_build_info',
      'prometheus_get_config',
      'prometheus_get_flags',
      'prometheus_get_label_values',
      'prometheus_get_metric_metadata',
      'prometheus_get_runtime_info',
      'prometheus_get_tsdb_status',
      'prometheus_list_alertmanagers',
      'prometheus_list_alerts',
      'prometheus_list_labels',
      'prometheus_list_rules',
      'prometheus_list_series',
      'prometheus_list_targets',
      'prometheus_query',
      'prometheus_query_range',
    ])
  })

  it('returns connected business values when component URLs are disabled', async () => {
    const client = new MonitoringClient({
      prometheusBaseUrl: '',
      alertmanagerBaseUrl: '',
      lokiBaseUrl: '',
      grafanaBaseUrl: '',
      fetchImpl: vi.fn(),
    })
    const map = tools(client)

    expect(await map.prometheus_query.execute({ query: 'up' }, exec())).toMatchObject({
      connected: false,
      reason: 'Prometheus base URL is not configured.',
    })
    expect(await map.alertmanager_list_alerts.execute({}, exec())).toMatchObject({
      connected: false,
      reason: 'Alertmanager base URL is not configured.',
    })
    expect(await map.loki_query.execute({ query: '{job="app"}' }, exec())).toMatchObject({
      connected: false,
      reason: 'Loki base URL is not configured.',
    })
    expect(await map.grafana_get_health.execute({}, exec())).toMatchObject({
      connected: false,
      reason: 'Grafana base URL is not configured.',
    })
  })

  it('executes a Prometheus query and forwards the request', async () => {
    const fetchImpl = vi.fn(async () => json({
      status: 'success',
      data: { resultType: 'vector', result: [{ metric: { __name__: 'up' }, value: [1700000000, '1'] }] },
    }))
    const map = tools(new MonitoringClient({ prometheusBaseUrl: 'http://prom:9090', fetchImpl }))
    const result = await map.prometheus_query.execute({ query: 'up' }, exec())

    expect(result).toMatchObject({ connected: true, resultType: 'vector', seriesCount: 1 })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://prom:9090/api/v1/query?query=up')
  })

  it('executes Prometheus build, runtime, and flag read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(prom({
        version: '2.55.0',
        revision: 'abc123',
        branch: 'HEAD',
        goVersion: 'go1.22.4',
        buildUser: 'root@builder',
        buildDate: '2024-01-01T00:00:00Z',
      }))
      .mockResolvedValueOnce(prom({
        startTime: '2026-08-30T00:00:00Z',
        CWD: '/prometheus',
        reloadConfigSuccess: true,
        lastConfigTime: '2026-08-30T01:00:00Z',
        goroutineCount: 42,
        timeSeriesCount: 123,
      }))
      .mockResolvedValueOnce(prom({
        'log.level': 'info',
        'web.enable-lifecycle': 'false',
      }))
    const map = tools(new MonitoringClient({ prometheusBaseUrl: 'http://prom:9090', fetchImpl }))

    expect(await map.prometheus_get_build_info.execute({}, exec())).toMatchObject({
      connected: true,
      version: '2.55.0',
      revision: 'abc123',
    })
    expect(await map.prometheus_get_runtime_info.execute({}, exec())).toMatchObject({
      connected: true,
      cwd: '/prometheus',
      reloadConfigSuccess: true,
      timeSeriesCount: 123,
    })
    expect(await map.prometheus_get_flags.execute({}, exec())).toMatchObject({
      connected: true,
      count: 2,
    })

    expect(fetchImpl.mock.calls.length).toBe(3)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://prom:9090/api/v1/status/buildinfo',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://prom:9090/api/v1/status/runtimeinfo',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://prom:9090/api/v1/status/flags',
    )
  })

  it('executes Prometheus metadata, Alertmanagers, and config read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(prom({
        http_requests_total: [{
          type: 'counter',
          help: 'Total HTTP requests.',
          unit: 'req',
        }],
      }))
      .mockResolvedValueOnce(prom({
        activeAlertmanagers: [{
          url: 'http://am:9093/api/v1/alerts',
          labels: { cluster: 'prod' },
        }],
        droppedAlertmanagers: [{
          url: 'http://old:9093/api/v1/alerts',
          labels: { cluster: 'old' },
        }],
      }))
      .mockResolvedValueOnce(prom({ yaml: 'global:\n  scrape_interval: 30s\n' }))
    const map = tools(new MonitoringClient({ prometheusBaseUrl: 'http://prom:9090', fetchImpl }))

    expect((await map.prometheus_get_metric_metadata.execute({
      metric: 'http_requests_total',
      limit: 5,
    }, exec())).items[0]).toMatchObject({
      metric: 'http_requests_total',
      type: 'counter',
      unit: 'req',
    })
    expect(await map.prometheus_list_alertmanagers.execute({}, exec())).toMatchObject({
      connected: true,
      activeCount: 1,
      droppedCount: 1,
    })
    expect(await map.prometheus_get_config.execute({}, exec())).toMatchObject({
      connected: true,
      configYaml: expect.stringContaining('scrape_interval'),
    })

    expect(fetchImpl.mock.calls.length).toBe(3)
  })

  it('executes a Loki query range and forwards the request', async () => {
    const fetchImpl = vi.fn(async () => json({
      status: 'success',
      data: {
        resultType: 'streams',
        result: [{
          stream: { app: 'api' },
          values: [['1700000000000000000', 'hello']],
        }],
      },
    }))
    const map = tools(new MonitoringClient({ lokiBaseUrl: 'http://loki:3100', fetchImpl }))
    const result = await map.loki_query_range.execute({
      query: '{app="api"}',
      start: '1700000000',
      end: '1700003600',
    }, exec())

    expect(result).toMatchObject({ connected: true, resultType: 'streams', seriesCount: 1, entryCount: 1 })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://loki:3100/loki/api/v1/query_range?query=%7Bapp%3D%22api%22%7D&start=1700000000&end=1700003600',
    )
  })

  it('executes Loki rule, alert, volume, and pattern read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('ns1:\n- name: group-a\n', {
        status: 200,
        headers: { 'content-type': 'application/yaml' },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          groups: [{
            name: 'group-a',
            file: 'rules.yaml',
            rules: [{
              name: 'cpu_high',
              type: 'alerting',
              health: 'ok',
              lastError: '',
              query: 'sum(rate({job="app"}[5m]))',
              duration: '5m',
              labels: {},
              annotations: {},
              alerts: [],
            }],
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          alerts: [{
            state: 'firing',
            value: '1e+00',
            activeAt: '2026-08-28T00:00:00Z',
            labels: { alertname: 'HighCPU' },
            annotations: {},
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [{ metric: { job: 'app' }, value: [1700000000, '2048'] }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [{ metric: { job: 'app' }, values: [[1700000000, '1024']] }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: [{ pattern: 'level=info <_>', samples: [[1711839260, 1], [1711839270, 2]] }],
      }))
    const map = tools(new MonitoringClient({ lokiBaseUrl: 'http://loki:3100', fetchImpl }))

    expect((await map.loki_list_rule_groups.execute({}, exec())).ruleGroupsYaml).toContain('group-a')
    expect((await map.loki_list_rules.execute({}, exec())).items).toHaveLength(1)
    expect((await map.loki_list_alerts.execute({}, exec())).items).toHaveLength(1)
    expect(await map.loki_get_index_volume.execute({
      query: '{job="app"}',
      start: '1700000000',
      end: '1700003600',
    }, exec())).toMatchObject({ connected: true, totalBytes: 2048 })
    expect(await map.loki_get_index_volume_range.execute({
      query: '{job="app"}',
      start: '1700000000',
      end: '1700003600',
      step: '60s',
    }, exec())).toMatchObject({ connected: true, totalBytes: 1024 })
    expect((await map.loki_get_patterns.execute({
      query: '{job="app"}',
      start: '1711839260',
      end: '1711839280',
    }, exec())).items[0].totalCount).toBe(3)
    expect(fetchImpl.mock.calls.length).toBe(6)
  })

  it('executes Grafana read tools and forwards requests', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ database: 'ok', version: '11.2.0', commit: 'abc123' }))
      .mockResolvedValueOnce(json([{
        id: 1,
        uid: 'ds-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prom:9090',
        access: 'proxy',
        isDefault: true,
        basicAuth: false,
        withCredentials: false,
        database: '',
        user: '',
      }]))
      .mockResolvedValueOnce(json({
        id: 1,
        uid: 'ds-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://prom:9090',
        access: 'proxy',
        isDefault: true,
        basicAuth: false,
        withCredentials: false,
        database: '',
        user: '',
      }))
      .mockResolvedValueOnce(json([{
        id: 10,
        uid: 'dash-1',
        title: 'Overview',
        url: '/d/dash-1/overview',
        type: 'dash-db',
        tags: ['prod'],
        isStarred: false,
        folderUid: 'folder-1',
        folderTitle: 'Ops',
      }]))
      .mockResolvedValueOnce(json({
        dashboard: {
          uid: 'dash-1',
          title: 'Overview',
          url: '/d/dash-1/overview',
          panels: [{ id: 1 }],
        },
        meta: { url: '/d/dash-1/overview' },
      }))
      .mockResolvedValueOnce(json([{
        id: 1,
        uid: 'folder-1',
        title: 'Ops',
        url: '/dashboards/f/folder-1/ops',
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect(await map.grafana_get_health.execute({}, exec())).toMatchObject({
      connected: true,
      version: '11.2.0',
    })
    expect((await map.grafana_list_datasources.execute({}, exec())).items).toHaveLength(1)
    expect((await map.grafana_get_datasource.execute({ uid: 'ds-1' }, exec())).item.name).toBe('Prometheus')
    expect((await map.grafana_search_dashboards.execute({ query: 'prod' }, exec())).items[0].uid).toBe('dash-1')
    expect(await map.grafana_get_dashboard.execute({ uid: 'dash-1' }, exec())).toMatchObject({
      connected: true,
      panelCount: 1,
    })
    expect((await map.grafana_list_folders.execute({}, exec())).items[0].uid).toBe('folder-1')
    expect(fetchImpl.mock.calls.length).toBe(6)
  })

  it('executes Grafana alert rule and notification read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([{
        uid: 'rule-1',
        title: 'High CPU',
        folderUID: 'folder-1',
        namespaceUID: 'ns-1',
        dashboardUID: 'dash-1',
        panelID: 2,
        ruleGroup: 'critical',
        condition: 'C',
        data: [{ refId: 'C', datasourceUid: 'ds-1' }],
        noDataState: 'NoData',
        execErrState: 'Error',
        for: '5m',
        intervalSeconds: 60,
        paused: false,
        updated: '2026-08-30T00:00:00Z',
        version: 2,
        labels: { severity: 'critical' },
        annotations: { summary: 'CPU high' },
      }]))
      .mockResolvedValueOnce(json({
        uid: 'rule-1',
        title: 'High CPU',
        folderUID: 'folder-1',
        ruleGroup: 'critical',
        condition: 'C',
        data: [{ refId: 'C' }],
        noDataState: 'NoData',
        execErrState: 'Error',
        for: '5m',
        intervalSeconds: 60,
        paused: false,
        updated: '2026-08-30T00:00:00Z',
        version: 2,
        labels: {},
        annotations: {},
      }))
      .mockResolvedValueOnce(json([{
        uid: 'cp-1',
        name: 'ops-webhook',
        type: 'webhook',
        settings: { url: 'https://example.com/hook' },
        disableResolveMessage: false,
      }]))
      .mockResolvedValueOnce(json({
        receiver: 'ops-webhook',
        group_by: ['alertname'],
        group_wait: '30s',
        group_interval: '5m',
        repeat_interval: '4h',
        routes: [],
      }))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_alert_rules.execute({}, exec())).items[0]).toMatchObject({
      uid: 'rule-1',
      title: 'High CPU',
      folderUid: 'folder-1',
      duration: '5m',
      labelsJson: expect.stringContaining('critical'),
    })
    expect((await map.grafana_get_alert_rule.execute({ uid: 'rule-1' }, exec())).item.condition).toBe('C')
    expect((await map.grafana_list_contact_points.execute({}, exec())).items[0]).toMatchObject({
      uid: 'cp-1',
      name: 'ops-webhook',
      type: 'webhook',
      settingsJson: expect.stringContaining('example.com'),
    })
    expect(await map.grafana_get_notification_policy.execute({}, exec())).toMatchObject({
      connected: true,
      receiver: 'ops-webhook',
      groupByJson: expect.stringContaining('alertname'),
    })
    expect(fetchImpl.mock.calls.length).toBe(4)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/v1/provisioning/alert-rules')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/v1/provisioning/alert-rules/rule-1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/v1/provisioning/contact-points')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/v1/provisioning/policies')
  })

  it('executes Grafana team and org user read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({
        totalCount: 1,
        page: 1,
        perPage: 10,
        teams: [{
          id: 1,
          orgId: 1,
          name: 'SRE',
          email: 'sre@example.com',
          avatarUrl: '/avatar/sre',
          memberCount: 3,
        }],
      }))
      .mockResolvedValueOnce(json({
        id: 1,
        orgId: 1,
        name: 'SRE',
        email: 'sre@example.com',
        created: '2026-08-30T00:00:00Z',
        updated: '2026-08-30T01:00:00Z',
      }))
      .mockResolvedValueOnce(json([{
        orgId: 1,
        teamId: 1,
        userId: 10,
        email: 'alice@example.com',
        login: 'alice',
        name: 'Alice',
        avatarUrl: '/avatar/alice',
      }]))
      .mockResolvedValueOnce(json([{
        orgId: 1,
        userId: 10,
        email: 'alice@example.com',
        login: 'alice',
        name: 'Alice',
        role: 'Admin',
        isExternal: false,
        lastSeenAt: '2026-08-30T00:00:00Z',
        lastSeenAtAge: '2m',
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_teams.execute({
      query: 'ops',
      sort: 'memberCount-desc',
      page: 1,
      perPage: 10,
    }, exec()))).toMatchObject({
      connected: true,
      totalCount: 1,
      page: 1,
      perPage: 10,
      items: [{ id: 1, name: 'SRE', memberCount: 3 }],
    })
    expect((await map.grafana_get_team.execute({ teamId: 1 }, exec())).item).toMatchObject({
      id: 1,
      name: 'SRE',
      orgId: 1,
    })
    expect((await map.grafana_list_team_members.execute({ teamId: 1 }, exec())).items[0]).toMatchObject({
      teamId: 1,
      userId: 10,
      login: 'alice',
    })
    expect((await map.grafana_list_org_users.execute({}, exec())).items[0]).toMatchObject({
      userId: 10,
      email: 'alice@example.com',
      role: 'Admin',
      lastSeenAtAge: '2m',
    })
    expect(fetchImpl.mock.calls.length).toBe(4)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/teams/search?query=ops&sort=memberCount-desc&page=1&perpage=10',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/teams/1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/teams/1/members')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/org/users')
  })

  it('executes Grafana organization and org user read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([
        {
          id: 1,
          name: 'Main Org',
          createdAt: '2026-08-01T00:00:00Z',
          updatedAt: '2026-08-02T00:00:00Z',
        },
        {
          id: 2,
          name: 'Secondary Org',
          createdAt: '2026-08-03T00:00:00Z',
          updatedAt: '2026-08-04T00:00:00Z',
        },
      ]))
      .mockResolvedValueOnce(json({
        id: 2,
        name: 'Secondary Org',
        address: { city: 'Beijing' },
        createdAt: '2026-08-03T00:00:00Z',
        updatedAt: '2026-08-04T00:00:00Z',
      }))
      .mockResolvedValueOnce(json([{
        orgId: 2,
        userId: 20,
        email: 'bob@example.com',
        login: 'bob',
        name: 'Bob',
        role: 'Viewer',
        isExternal: false,
        lastSeenAt: '2026-08-30T00:00:00Z',
        lastSeenAtAge: '5m',
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect(await map.grafana_list_orgs.execute({}, exec())).toMatchObject({
      connected: true,
      totalCount: 2,
      items: [
        { id: 1, name: 'Main Org' },
        { id: 2, name: 'Secondary Org' },
      ],
    })
    expect(await map.grafana_get_org.execute({ orgId: 2 }, exec())).toMatchObject({
      connected: true,
      id: 2,
      name: 'Secondary Org',
      addressJson: expect.stringContaining('Beijing'),
    })
    expect((await map.grafana_list_org_users_by_org.execute({ orgId: 2 }, exec())).items[0]).toMatchObject({
      orgId: 2,
      userId: 20,
      login: 'bob',
      role: 'Viewer',
      lastSeenAtAge: '5m',
    })

    expect(fetchImpl.mock.calls.length).toBe(3)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/orgs')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/orgs/2')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/orgs/2/users')
  })

  it('executes Grafana service account and org quota read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({
        totalCount: 1,
        page: 1,
        perPage: 10,
        serviceAccounts: [{
          id: 1,
          name: 'metrics',
          login: 'sa-metrics',
          orgId: 1,
          isDisabled: false,
          role: 'Editor',
          tokens: 2,
          avatarUrl: '/avatar/metrics',
          accessControl: { 'serviceaccounts:read': true },
        }],
      }))
      .mockResolvedValueOnce(json({
        id: 1,
        name: 'metrics',
        login: 'sa-metrics',
        orgId: 1,
        isDisabled: false,
        role: 'Editor',
        tokens: 2,
        avatarUrl: '/avatar/metrics',
        accessControl: { 'serviceaccounts:read': true },
      }))
      .mockResolvedValueOnce(json([{
        id: 11,
        name: 'ci-token',
        role: 'Editor',
        created: '2026-08-30T00:00:00Z',
        expiration: null,
        secondsUntilExpiration: 0,
        hasExpired: false,
      }]))
      .mockResolvedValueOnce(json([
        { orgId: 1, target: 'org', limit: -1, used: 1 },
        { orgId: 1, target: 'alertRule', limit: 100, used: 3 },
      ]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_service_accounts.execute({
      query: 'metrics',
      page: 1,
      perPage: 10,
    }, exec()))).toMatchObject({
      connected: true,
      totalCount: 1,
      page: 1,
      perPage: 10,
      items: [{
        id: 1,
        name: 'metrics',
        login: 'sa-metrics',
        role: 'Editor',
        tokens: 2,
        accessControlJson: expect.stringContaining('serviceaccounts:read'),
      }],
    })
    expect((await map.grafana_get_service_account.execute({ serviceAccountId: 1 }, exec())).item).toMatchObject({
      id: 1,
      name: 'metrics',
      role: 'Editor',
    })
    expect((await map.grafana_list_service_account_tokens.execute({ serviceAccountId: 1 }, exec())).items[0]).toMatchObject({
      id: 11,
      name: 'ci-token',
      hasExpired: false,
    })
    expect((await map.grafana_list_org_quotas.execute({}, exec())).items).toMatchObject([
      { orgId: 1, target: 'org', limit: -1, used: 1 },
      { target: 'alertRule', used: 3 },
    ])
    expect(fetchImpl.mock.calls.length).toBe(4)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/serviceaccounts/search?query=metrics&page=1&perpage=10',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/serviceaccounts/1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/serviceaccounts/1/tokens')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/org/quotas')
  })

  it('executes Grafana folder and datasource permission read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([
        { id: 1, folderId: 1, role: 'Viewer', permission: 1, permissionName: 'View' },
        { id: 2, folderId: 1, userId: 10, userLogin: 'alice', userEmail: 'alice@example.com', permission: 4, permissionName: 'Admin' },
      ]))
      .mockResolvedValueOnce(json([
        {
          id: 4,
          roleName: 'fixed:datasources:reader',
          isManaged: false,
          isInherited: false,
          isServiceAccount: false,
          userId: 10,
          userLogin: 'alice',
          userAvatarUrl: '/avatar/alice',
          actions: ['datasources:read', 'datasources:query'],
          permission: 'Query',
        },
      ]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_folder_permissions.execute({ folderUid: 'folder-1' }, exec()))).toMatchObject({
      connected: true,
      items: [
        { role: 'Viewer', permissionName: 'View' },
        { userId: 10, userLogin: 'alice', permissionName: 'Admin' },
      ],
    })
    expect((await map.grafana_list_datasource_permissions.execute({
      datasourceUid: 'ds-1',
      dsType: 'prometheus',
    }, exec())).items[0]).toMatchObject({
      userLogin: 'alice',
      permission: 'Query',
      actionsJson: expect.stringContaining('datasources:read'),
    })
    expect(fetchImpl.mock.calls.length).toBe(2)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/folders/folder-1/permissions',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/datasources/ds-1?ds_type=prometheus',
    )
  })

  it('executes Grafana dashboard permission and access control role read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([
        {
          id: 1,
          dashboardId: -1,
          created: '2026-08-30T00:00:00Z',
          updated: '2026-08-30T01:00:00Z',
          userId: 0,
          userLogin: '',
          userEmail: '',
          teamId: 0,
          team: '',
          role: 'Viewer',
          permission: 1,
          permissionName: 'View',
          uid: 'dash-1',
          title: '',
          slug: '',
          isFolder: false,
          url: '',
        },
      ]))
      .mockResolvedValueOnce(json([
        {
          version: 3,
          uid: 'role-1',
          name: 'fixed:reports:reader',
          displayName: 'Report reader',
          description: 'Read all reports.',
          group: 'Reports',
          hidden: false,
          updated: '2026-08-30T00:00:00Z',
          created: '2026-08-30T00:00:00Z',
          global: false,
        },
      ]))
      .mockResolvedValueOnce(json({
        version: 4,
        uid: 'role-1',
        name: 'fixed:reports:reader',
        displayName: 'Report reader',
        description: 'Read all reports.',
        group: 'Reports',
        hidden: false,
        updated: '2026-08-30T00:00:00Z',
        created: '2026-08-30T00:00:00Z',
        global: false,
        permissions: [{ action: 'reports:read', scope: 'reports:*' }],
      }))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_dashboard_permissions.execute({ dashboardUid: 'dash-1' }, exec()))).toMatchObject({
      connected: true,
      items: [{ role: 'Viewer', permissionName: 'View', uid: 'dash-1' }],
    })
    expect((await map.grafana_list_access_control_roles.execute({
      includeHidden: true,
    }, exec())).items[0]).toMatchObject({
      uid: 'role-1',
      name: 'fixed:reports:reader',
      displayName: 'Report reader',
    })
    expect((await map.grafana_get_access_control_role.execute({ roleUid: 'role-1' }, exec())).item).toMatchObject({
      uid: 'role-1',
      version: 4,
      permissionsJson: expect.stringContaining('reports:read'),
    })
    expect(fetchImpl.mock.calls.length).toBe(3)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/dashboards/uid/dash-1/permissions',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/roles?includeHidden=true',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://grafana:3000/api/access-control/roles/role-1',
    )
  })

  it('executes Grafana built-in role and user role read tools', async () => {
    const builtinBody = {
      Viewer: [{ action: 'dashboards:read', scope: 'dashboards:*' }],
      Editor: [{ action: 'dashboards:write', scope: 'dashboards:*' }],
      Admin: [{ action: 'org.users:read', scope: 'users:*' }],
    }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(builtinBody))
      .mockResolvedValueOnce(json(builtinBody))
      .mockResolvedValueOnce(json([{
        version: 1,
        uid: 'role-1',
        name: 'fixed:reports:reader',
        displayName: 'Report reader',
        description: '',
        group: '',
        hidden: false,
        updated: '2026-08-30T00:00:00Z',
        created: '2026-08-30T00:00:00Z',
        global: false,
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_builtin_roles.execute({}, exec())).items).toMatchObject([
      { role: 'Viewer' },
      { role: 'Editor' },
      { role: 'Admin' },
    ])
    expect((await map.grafana_get_builtin_role.execute({
      builtInRole: 'Editor',
    }, exec())).item).toMatchObject({
      role: 'Editor',
      permissionsJson: expect.stringContaining('dashboards:write'),
    })
    expect((await map.grafana_list_user_roles.execute({
      userId: 10,
    }, exec())).items[0]).toMatchObject({
      uid: 'role-1',
      name: 'fixed:reports:reader',
    })

    expect(fetchImpl.mock.calls.length).toBe(3)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/access-control/builtin-roles',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/builtin-roles',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://grafana:3000/api/access-control/users/10/roles',
    )
  })

  it('executes Grafana user and team role read tools with hidden filters', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([{
        version: 1,
        uid: 'role-1',
        name: 'fixed:reports:reader',
        displayName: 'Report reader',
        description: '',
        group: '',
        hidden: true,
        updated: '2026-08-30T00:00:00Z',
        created: '2026-08-30T00:00:00Z',
        global: false,
      }]))
      .mockResolvedValueOnce(json([{
        version: 2,
        uid: 'role-2',
        name: 'fixed:alerts:writer',
        displayName: 'Alert writer',
        description: '',
        group: '',
        hidden: false,
        updated: '2026-08-30T00:00:00Z',
        created: '2026-08-30T00:00:00Z',
        global: false,
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_user_roles.execute({
      userId: 10,
      includeHidden: true,
    }, exec())).items[0]).toMatchObject({ uid: 'role-1', hidden: true })
    expect((await map.grafana_list_team_roles.execute({
      teamId: 5,
      includeHidden: true,
    }, exec())).items[0]).toMatchObject({ uid: 'role-2', hidden: false })

    expect(fetchImpl.mock.calls.length).toBe(2)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/access-control/users/10/roles?includeHidden=true',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/teams/5/roles?includeHidden=true',
    )
  })

  it('executes Grafana instance and dashboard audit read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({
        users: 3,
        orgs: 2,
        dashboards: 12,
        snapshots: 2,
        tags: 8,
        datasources: 5,
        playlists: 1,
        stars: 4,
        alerts: 6,
        activeAdmins: 1,
        activeEditors: 2,
        activeViewers: 5,
        activeUsers: 8,
        activeSessions: 9,
      }))
      .mockResolvedValueOnce(json([{
        id: 'grafana-piechart-panel',
        type: 'panel',
        name: 'Pie Chart',
        version: '2.0.0',
        enabled: true,
        pinned: false,
        hasUpdate: false,
        state: 'beta',
        signature: 'valid',
        info: { logos: { small: '/avatar/pie' } },
      }]))
      .mockResolvedValueOnce(json([{
        id: 101,
        dashboardId: 1,
        version: 3,
        parentVersion: 2,
        description: 'Updated panel',
        message: 'tuned thresholds',
        created: '2026-08-30T00:00:00Z',
        updated: '2026-08-30T01:00:00Z',
        createdBy: 'alice',
        updatedBy: 'alice',
      }]))
      .mockResolvedValueOnce(json([{
        id: 201,
        name: 'ops-live',
        key: 'ABC123',
        orgId: 1,
        userId: 10,
        external: true,
        externalUrl: 'https://example.com/s/ABC123',
        expires: '2026-09-01T00:00:00Z',
        createdAt: '2026-08-30T00:00:00Z',
        updatedAt: '2026-08-30T01:00:00Z',
      }]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect(await map.grafana_get_admin_stats.execute({}, exec())).toMatchObject({
      connected: true,
      users: 3,
      dashboards: 12,
      activeSessions: 9,
      statsJson: expect.stringContaining('activeAdmins'),
    })
    expect((await map.grafana_list_plugins.execute({}, exec())).items[0]).toMatchObject({
      id: 'grafana-piechart-panel',
      name: 'Pie Chart',
      enabled: true,
      signature: 'valid',
      infoJson: expect.stringContaining('avatar/pie'),
    })
    expect((await map.grafana_list_dashboard_versions.execute({
      dashboardUid: 'dash-1',
      limit: 5,
      start: 0,
    }, exec())).items[0]).toMatchObject({
      version: 3,
      parentVersion: 2,
      createdBy: 'alice',
      message: 'tuned thresholds',
    })
    expect((await map.grafana_list_dashboard_snapshots.execute({}, exec())).items[0]).toMatchObject({
      name: 'ops-live',
      key: 'ABC123',
      external: true,
      externalUrl: 'https://example.com/s/ABC123',
    })
    expect(fetchImpl.mock.calls.length).toBe(4)
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/admin/stats')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/plugins?embedded=true')
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://grafana:3000/api/dashboards/uid/dash-1/versions?limit=5&start=0',
    )
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/dashboard/snapshots')
  })

  it('executes Grafana access control and identity audit read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([
        { action: 'reports:read', scope: 'reports:*' },
        { action: 'dashboards:read', scope: 'dashboards:uid:dash-1' },
      ]))
      .mockResolvedValueOnce(json([
        { action: 'dashboards:edit', scope: 'dashboards:*' },
      ]))
      .mockResolvedValueOnce(json({
        theme: 'dark',
        homeDashboardUID: 'dash-1',
        timezone: 'utc',
        weekStart: 'monday',
      }))
      .mockResolvedValueOnce(json({
        id: 10,
        login: 'alice',
        email: 'alice@example.com',
        name: 'Alice',
        orgId: 1,
        isGrafanaAdmin: true,
        isDisabled: false,
        isExternal: false,
        updatedAt: '2026-08-30T00:00:00Z',
        createdAt: '2026-08-01T00:00:00Z',
        theme: 'dark',
        authLabels: ['ldap'],
      }))
      .mockResolvedValueOnce(json([
        { orgId: 1, name: 'Main', role: 'Admin' },
        { orgId: 2, name: 'Ops', role: 'Viewer' },
      ]))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect((await map.grafana_list_access_control_user_permissions.execute({
      userId: 10,
      scope: 'reports:*',
    }, exec())).items[0]).toMatchObject({ action: 'reports:read', scope: 'reports:*' })
    expect((await map.grafana_list_access_control_team_permissions.execute({
      teamId: 5,
    }, exec())).items[0]).toMatchObject({ action: 'dashboards:edit', scope: 'dashboards:*' })
    expect(await map.grafana_get_org_preferences.execute({}, exec())).toMatchObject({
      connected: true,
      theme: 'dark',
      homeDashboardUid: 'dash-1',
      timezone: 'utc',
      weekStart: 'monday',
    })
    expect(await map.grafana_get_current_user.execute({}, exec())).toMatchObject({
      connected: true,
      login: 'alice',
      isGrafanaAdmin: true,
      authLabelsJson: expect.stringContaining('ldap'),
    })
    expect((await map.grafana_list_current_user_orgs.execute({}, exec())).items).toMatchObject([
      { orgId: 1, name: 'Main', role: 'Admin' },
      { orgId: 2, name: 'Ops', role: 'Viewer' },
    ])
    expect(fetchImpl.mock.calls.length).toBe(5)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/access-control/users/10/permissions?scope=reports%3A*',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/teams/5/permissions',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/org/preferences')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/user')
    expect(fetchImpl.mock.calls[4][0]).toBe('http://grafana:3000/api/user/orgs')
  })

  it('executes Grafana library, playlist, and org inventory read tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({
        result: {
          totalCount: 2,
          page: 1,
          perPage: 10,
          elements: [{
            id: 1,
            orgId: 1,
            folderId: 2,
            uid: 'lib-1',
            name: 'CPU panel',
            kind: 1,
            type: 'timeseries',
            description: 'Shared CPU panel',
            version: 3,
            created: '2026-08-30T00:00:00Z',
            updated: '2026-08-30T01:00:00Z',
            model: { type: 'timeseries' },
            meta: { connectedDashboards: 2 },
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        result: {
          uid: 'lib-1',
          name: 'CPU panel',
          kind: 1,
          type: 'timeseries',
          version: 3,
          model: { targets: [{ refId: 'A' }] },
          meta: {},
        },
      }))
      .mockResolvedValueOnce(json([{
        id: 1,
        uid: 'pl-1',
        name: 'Ops rotation',
        interval: '5m',
        createdAt: '2026-08-30T00:00:00Z',
        updatedAt: '2026-08-30T01:00:00Z',
      }]))
      .mockResolvedValueOnce(json({
        uid: 'pl-1',
        name: 'Ops rotation',
        interval: '5m',
        items: [{
          id: 1,
          title: 'Overview',
          type: 'dashboard_by_uid',
          value: 'dash-1',
          order: 1,
        }],
      }))
      .mockResolvedValueOnce(json({
        id: 1,
        name: 'Main Org',
        address: { address1: 'Road 1', city: 'Shanghai', country: 'CN' },
      }))
    const map = tools(new MonitoringClient({ grafanaBaseUrl: 'http://grafana:3000', fetchImpl }))

    expect(await map.grafana_list_library_elements.execute({
      searchString: 'cpu',
      type: 'timeseries',
      kind: 'panel',
      perPage: 10,
      page: 1,
    }, exec())).toMatchObject({
      connected: true,
      totalCount: 2,
      items: [{
        uid: 'lib-1',
        name: 'CPU panel',
        modelJson: expect.stringContaining('timeseries'),
      }],
    })
    expect((await map.grafana_get_library_element.execute({
      libraryElementUid: 'lib-1',
    }, exec())).item).toMatchObject({
      uid: 'lib-1',
      version: 3,
      modelJson: expect.stringContaining('targets'),
    })
    expect((await map.grafana_list_playlists.execute({}, exec())).items[0]).toMatchObject({
      uid: 'pl-1',
      name: 'Ops rotation',
      interval: '5m',
    })
    expect((await map.grafana_get_playlist.execute({
      playlistUid: 'pl-1',
    }, exec())).item).toMatchObject({
      uid: 'pl-1',
      itemsJson: expect.stringContaining('dashboard_by_uid'),
    })
    expect(await map.grafana_get_current_org.execute({}, exec())).toMatchObject({
      connected: true,
      id: 1,
      name: 'Main Org',
      addressJson: expect.stringContaining('Shanghai'),
    })
    expect(fetchImpl.mock.calls.length).toBe(5)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/library-elements/search?searchString=cpu&type=timeseries&kind=panel&perPage=10&page=1',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/library-elements/lib-1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/playlists')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/playlists/pl-1')
    expect(fetchImpl.mock.calls[4][0]).toBe('http://grafana:3000/api/org')
  })

  it('executes Loki detected field and Grafana alert observation tools', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          fields: [{
            label: 'level',
            type: 'string',
            cardinality: 3,
            parsers: ['logfmt'],
            jsonPath: '',
          }],
          limit: 100,
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: { values: ['debug', 'info'], limit: 50 },
      }))
      .mockResolvedValueOnce(json([{
        id: 1,
        alertId: 0,
        dashboardUID: 'dash-1',
        panelId: 1,
        userId: 1,
        userName: 'alice',
        newState: '',
        prevState: '',
        time: 1507266395000,
        timeEnd: 1507266395000,
        text: 'deploy',
        tags: ['prod'],
        data: {},
      }]))
      .mockResolvedValueOnce(json([{
        fingerprint: 'abc',
        startsAt: '2026-08-28T00:00:00Z',
        endsAt: '0001-01-01T00:00:00Z',
        status: { state: 'active' },
        labels: { alertname: 'HighCPU' },
        annotations: {},
        receivers: [{ name: 'webhook' }],
      }]))
    const map = tools(new MonitoringClient({
      lokiBaseUrl: 'http://loki:3100',
      grafanaBaseUrl: 'http://grafana:3000',
      fetchImpl,
    }))

    expect((await map.loki_get_detected_fields.execute({
      query: '{job="app"}',
      start: '1700000000',
      end: '1700003600',
    }, exec())).items[0]).toMatchObject({ label: 'level', cardinality: 3 })
    expect((await map.loki_get_detected_field_values.execute({
      fieldName: 'level',
      query: '{job="app"}',
    }, exec())).items).toEqual(['debug', 'info'])
    expect((await map.grafana_list_annotations.execute({
      tagsJson: '["prod","api"]',
      dashboardUid: 'dash-1',
    }, exec())).items[0].text).toBe('deploy')
    expect((await map.grafana_list_alert_instances.execute({
      active: false,
      receiver: 'webhook',
    }, exec())).items[0].fingerprint).toBe('abc')
    expect(await map.grafana_list_annotations.execute({ tagsJson: 'not-json' }, exec())).toMatchObject({
      connected: false,
      reason: 'tagsJson must be a valid JSON array.',
    })
    expect(fetchImpl.mock.calls.length).toBe(4)
  })

  it('keeps all write tools gated when allowWrite is not enabled', async () => {
    const fetchImpl = vi.fn()
    const map = tools(new MonitoringClient({ fetchImpl }))

    expect(await map.prometheus_delete_series.execute({ matchersJson: '["up"]' }, exec())).toMatchObject({ ok: false })
    expect(await map.alertmanager_create_silence.execute({
      matchersJson: '[{"name":"severity","value":"critical"}]',
      startsAt: '2026-08-28T00:00:00Z',
      endsAt: '2026-08-28T01:00:00Z',
      createdBy: 'bot',
      comment: 'maintenance',
    }, exec())).toMatchObject({ ok: false })
    expect(await map.alertmanager_delete_silence.execute({ silenceId: 'sil-1' }, exec())).toMatchObject({ ok: false })
    expect(await map.alertmanager_send_alerts.execute({ alertsJson: '[{"labels":{"alertname":"X"}}]' }, exec())).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('validates JSON array inputs before write execution', async () => {
    const map = tools(new MonitoringClient({ allowWrite: true, fetchImpl: vi.fn() }))

    expect(await map.prometheus_delete_series.execute({ matchersJson: 'not-json' }, exec())).toMatchObject({
      ok: false,
      reason: 'matchersJson must be a valid JSON array.',
    })
    expect(await map.alertmanager_create_silence.execute({
      matchersJson: '[{"name":"severity"}]',
      startsAt: 'x',
      endsAt: 'y',
      createdBy: 'bot',
      comment: 'c',
    }, exec())).toMatchObject({
      ok: false,
      reason: 'matchersJson must contain matcher objects with name and value strings.',
    })
    expect(await map.alertmanager_send_alerts.execute({ alertsJson: '[{"labels":"bad"}]' }, exec())).toMatchObject({
      ok: false,
      reason: 'alertsJson must contain alert objects with labels objects.',
    })
  })

  it('validates Loki series selector JSON and renders Loki results', async () => {
    const map = tools()

    expect(await map.loki_list_series.execute({ matchesJson: 'not-json' }, exec())).toMatchObject({
      connected: false,
      reason: 'matchesJson must be a valid JSON array.',
    })

    const queryRender = await (map.loki_query.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      connected: true,
      resultType: 'streams',
      seriesCount: 1,
      entryCount: 1,
      resultJson: '[]',
    })
    expect(JSON.stringify(queryRender)).toContain('1 stream(s), 1 entries')
  })

  it('renders query and alert lists into readable text', async () => {
    const map = tools()
    const queryRender = await (map.prometheus_query.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      connected: true,
      resultType: 'vector',
      seriesCount: 1,
      resultJson: '[{"metric":{"__name__":"up"},"value":[1,"1"]}]',
    })
    expect(JSON.stringify(queryRender)).toContain('vector (1 result(s))')

    const groupsRender = await (map.alertmanager_list_alert_groups.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      connected: true,
      items: [{ receiver: 'webhook', labelsJson: '{"alertname":"X"}', alertCount: 2, alertsJson: '[]' }],
    })
    expect(JSON.stringify(groupsRender)).toContain('webhook')
  })

  it('presents read and write tool calls', () => {
    const map = tools()
    expect(map.prometheus_query.presentCall!({ query: 'up' })).toMatchObject({ kind: 'search' })
    expect(map.prometheus_list_targets.presentResult!({}, { connected: true, activeCount: 3 })).toMatchObject({
      title: '3 active target(s)',
    })
    expect(map.alertmanager_create_silence.presentCall!({
      matchersJson: '[{"name":"severity","value":"critical"}]',
      startsAt: '2026-08-28T00:00:00Z',
      endsAt: '2026-08-28T01:00:00Z',
      createdBy: 'bot',
      comment: 'maintenance',
    })).toMatchObject({ kind: 'edit' })
    expect(map.loki_query.presentCall!({ query: '{app="api"}' })).toMatchObject({ kind: 'search' })
    expect(map.alertmanager_delete_silence.presentResult!({ silenceId: 'sil-1' }, { ok: true })).toMatchObject({
      title: 'Silence deleted',
    })
  })
})
