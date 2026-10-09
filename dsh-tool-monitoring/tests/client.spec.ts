import { describe, expect, it, vi } from 'vitest'
import { MonitoringClient, MonitoringError } from '../src/client.ts'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function prom(body: unknown): Response {
  return json({ status: 'success', data: body })
}

function am(body: unknown): Response {
  return json(body)
}

function requestInit(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): RequestInit {
  return (fetchImpl.mock.calls[callIndex] as [string, RequestInit])[1]
}

describe('MonitoringClient', () => {
  it('redacts credentials from raw monitoring payloads and enforces an output byte limit', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(prom({ yaml: [
        'secureJsonData:',
        '  providerSpecificField: raw-secure-value',
        'secureJsonData: { providerSpecificField: inline-secure-value }',
        'secureJsonData: {',
        '  providerSpecificField: "multiline } secure-value",',
        '  secondField: multiline-inline-secret',
        '}',
        'secureJsonData: |-',
        '  scalar-secure-value',
        'global:',
        '  password: prom-secret',
        '  bearer_token: abc123',
        '  client_secret: client-secret-value',
        '  tls_auth: tls-secret-value',
        '  httpHeaderValue1: header-secret-value',
      ].join('\n') }))
      .mockResolvedValueOnce(json([{
        uid: 'ds-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'https://prom.example.com',
        secureJsonData: {
          password: 'grafana-secret',
          bearerToken: 'token-xyz',
          httpHeaderValue1: 'header-datasource-secret',
          tlsAuth: 'tls-datasource-secret',
          nested: { tls_auth: 'nested-tls-secret' },
        },
      }]))
      .mockResolvedValueOnce(json({
        dashboard: { uid: 'dash-1', title: 'Ops', panels: [{ targets: [{ expr: 'password=panel-secret' }] }] },
        meta: { webhook: 'https://hooks.example.test/secret' },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: { resultType: 'streams', result: [{ stream: { token: 'loki-token' }, values: [['1', 'password=loki-secret ' + 'x'.repeat(400)]] }] },
      }))
    const client = new MonitoringClient({
      prometheusBaseUrl: 'http://prom:9090',
      grafanaBaseUrl: 'http://grafana:3000',
      lokiBaseUrl: 'http://loki:3100',
      fetchImpl,
      maxOutputBytes: 180,
    })

    const config = await client.getConfig()
    const datasource = await client.grafanaListDatasources()
    const dashboard = await client.grafanaGetDashboard('dash-1')
    const logs = await client.lokiQueryRange('{app="api"}', { start: '1', end: '2' })

    for (const value of [config.configYaml, datasource.items[0].settingsJson ?? '', dashboard.dashboardJson, logs.resultJson]) {
      expect(value).not.toMatch(/prom-secret|abc123|client-secret-value|tls-secret-value|header-secret-value|raw-secure-value|inline-secure-value|multiline } secure-value|multiline-inline-secret|scalar-secure-value|grafana-secret|token-xyz|header-datasource-secret|tls-datasource-secret|nested-tls-secret|panel-secret|hooks\.example\.test\/secret|loki-token|loki-secret/)
      expect(Buffer.byteLength(value, 'utf8')).toBeLessThanOrEqual(180)
    }
  })

  it('rejects remote plain HTTP endpoints unless insecure HTTP is explicitly enabled', async () => {
    const fetchImpl = vi.fn()
    const client = new MonitoringClient({
      prometheusBaseUrl: 'http://prom.example.com:9090',
      fetchImpl,
    })

    await expect(client.query('up')).rejects.toThrow(/HTTPS|HTTP.*allowInsecureHttp/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('runs a Prometheus instant query and maps vector results', async () => {
    const fetchImpl = vi.fn()
    fetchImpl.mockResolvedValueOnce(prom({
      resultType: 'vector',
      result: [
        {
          metric: { __name__: 'up', instance: 'localhost:9090' },
          value: [1700000000, '1'],
        },
      ],
    }))
    const client = new MonitoringClient({
      prometheusBaseUrl: 'http://prom:9090',
      prometheusToken: 'tok',
      fetchImpl,
    })
    const result = await client.query('up', { time: '2026-08-28T00:00:00Z' })

    expect(result).toMatchObject({
      connected: true,
      resultType: 'vector',
      seriesCount: 1,
    })
    expect(JSON.parse(result.resultJson)[0].metric.__name__).toBe('up')
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://prom:9090/api/v1/query?query=up&time=2026-08-28T00%3A00%3A00Z',
    )
    expect(requestInit(fetchImpl).headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('runs a Prometheus range query with start, end, and step', async () => {
    const fetchImpl = vi.fn(async () => prom({
      resultType: 'matrix',
      result: [{ metric: { __name__: 'up' }, values: [[1700000000, '1']] }],
    }))
    const client = new MonitoringClient({ fetchImpl })
    const result = await client.queryRange('rate(http_requests_total[5m])', {
      start: '1700000000',
      end: '1700003600',
      step: '60s',
    })

    expect(result.seriesCount).toBe(1)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://localhost:9090/api/v1/query_range?query=rate(http_requests_total%5B5m%5D)&start=1700000000&end=1700003600&step=60s',
    )
  })

  it('lists Prometheus targets with active and dropped counts', async () => {
    const fetchImpl = vi.fn(async () => prom({
      activeTargets: [{
        scrapeUrl: 'http://node:9100/metrics',
        health: 'up',
        lastError: '',
        labels: { job: 'node' },
      }],
      droppedTargets: [{ scrapeUrl: 'http://old:9100/metrics', health: 'unknown', lastError: 'no response', labels: {} }],
    }))
    const client = new MonitoringClient({ fetchImpl })
    const result = await client.listTargets()
    expect(result).toMatchObject({ connected: true, activeCount: 1, droppedCount: 1 })
    expect(result.items[0].labelsJson).toContain('node')
  })

  it('maps Prometheus alerts, rules, labels, label values, and TSDB status', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(prom({
        alerts: [{
          state: 'firing',
          value: '1e+00',
          activeAt: '2026-08-28T00:00:00Z',
          labels: { alertname: 'HighCPU' },
          annotations: { summary: 'CPU high' },
        }],
      }))
      .mockResolvedValueOnce(prom({
        groups: [{
          name: 'rules',
          rules: [{
            name: 'job:up:sum',
            type: 'recording',
            health: 'ok',
            query: 'sum(up)',
            duration: '0s',
            labels: {},
            alerts: [],
          }],
        }],
      }))
      .mockResolvedValueOnce(prom(['__name__', 'job']))
      .mockResolvedValueOnce(prom(['prometheus', 'node']))
      .mockResolvedValueOnce(prom({ headStats: { numSeries: 42 }, seriesCountByMetricName: [] }))
    const client = new MonitoringClient({ fetchImpl })

    expect((await client.listAlerts()).items[0]).toMatchObject({
      state: 'firing',
      labelsJson: expect.stringContaining('HighCPU'),
    })
    expect((await client.listRules()).items[0]).toMatchObject({ name: 'job:up:sum', activeAlertCount: 0 })
    expect((await client.listLabels()).items).toEqual(['__name__', 'job'])
    expect((await client.getLabelValues('job')).items).toEqual(['prometheus', 'node'])
    expect((await client.getTsdbStatus()).headSeriesCount).toBe(42)
  })

  it('maps Prometheus build info, runtime info, and flags', async () => {
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
    const client = new MonitoringClient({
      prometheusBaseUrl: 'http://prom:9090',
      prometheusToken: 'ptok',
      fetchImpl,
    })

    expect(await client.getBuildInfo()).toMatchObject({
      connected: true,
      version: '2.55.0',
      revision: 'abc123',
      goVersion: 'go1.22.4',
    })
    expect(await client.getRuntimeInfo()).toMatchObject({
      connected: true,
      startTime: '2026-08-30T00:00:00Z',
      cwd: '/prometheus',
      reloadConfigSuccess: true,
      goroutineCount: 42,
      timeSeriesCount: 123,
    })
    expect(await client.getFlags()).toMatchObject({
      connected: true,
      count: 2,
      flagsJson: expect.stringContaining('web.enable-lifecycle'),
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer ptok' })
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

  it('maps Prometheus metric metadata, discovered Alertmanagers, and config', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(prom({
        http_requests_total: [{
          type: 'counter',
          help: 'Total HTTP requests.',
          unit: 'req',
        }],
        process_cpu_seconds_total: [{
          type: 'counter',
          help: 'Total user and system CPU time spent in seconds.',
          unit: '',
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
    const client = new MonitoringClient({ prometheusBaseUrl: 'http://prom:9090', fetchImpl })

    const metadata = await client.getMetadata({ metric: 'http_requests_total', limit: 5 })
    expect(metadata).toMatchObject({ connected: true, count: 2 })
    expect(metadata.items[0]).toMatchObject({
      metric: 'http_requests_total',
      type: 'counter',
      help: 'Total HTTP requests.',
      unit: 'req',
    })
    expect(metadata.items[1].metric).toBe('process_cpu_seconds_total')

    const alertmanagers = await client.listAlertmanagers()
    expect(alertmanagers).toMatchObject({ connected: true, activeCount: 1, droppedCount: 1 })
    expect(alertmanagers.activeItems[0].labelsJson).toContain('prod')
    expect(alertmanagers.droppedItems[0].url).toBe('http://old:9093/api/v1/alerts')

    const config = await client.getConfig()
    expect(config).toMatchObject({
      connected: true,
      configYaml: expect.stringContaining('scrape_interval'),
      length: expect.any(Number),
    })
    expect(config.length).toBe(config.configYaml.length)

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://prom:9090/api/v1/metadata?metric=http_requests_total&limit=5',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://prom:9090/api/v1/alertmanagers')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://prom:9090/api/v1/status/config')
  })

  it('gates and executes Prometheus series deletion', async () => {
    const fetchImpl = vi.fn()
    const gated = new MonitoringClient({ fetchImpl })
    expect(await gated.deleteSeries(['up{job="node"}'])).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()

    fetchImpl.mockResolvedValueOnce(prom(null))
    const allowed = new MonitoringClient({ allowWrite: true, fetchImpl })
    expect(await allowed.deleteSeries(['up{job="node"}'], { start: '1', end: '2' })).toEqual({ ok: true })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]=up%7Bjob%3D%22node%22%7D&start=1&end=2',
    )
    expect(requestInit(fetchImpl).method).toBe('POST')
  })

  it('queries Loki ranges and maps stream results with tenant scoping', async () => {
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
    const client = new MonitoringClient({
      lokiBaseUrl: 'http://loki:3100',
      lokiToken: 'lokitok',
      lokiTenantId: 'tenant-a',
      fetchImpl,
    })

    const result = await client.lokiQueryRange('{app="api"}', {
      start: '1700000000',
      end: '1700003600',
      limit: 50,
      direction: 'forward',
    })

    expect(result).toMatchObject({ connected: true, resultType: 'streams', seriesCount: 1, entryCount: 1 })
    expect(JSON.parse(result.resultJson)[0].stream.app).toBe('api')
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://loki:3100/loki/api/v1/query_range?query=%7Bapp%3D%22api%22%7D&start=1700000000&end=1700003600&limit=50&direction=forward',
    )
    expect(requestInit(fetchImpl).headers).toMatchObject({
      authorization: 'Bearer lokitok',
      'x-scope-orgid': 'tenant-a',
    })
  })

  it('lists Loki labels, label values, series, index stats, and build info', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json({ status: 'success', data: ['app', 'env'] }))
      .mockResolvedValueOnce(json({ status: 'success', data: ['api', 'worker'] }))
      .mockResolvedValueOnce(json({ status: 'success', data: [{ app: 'api' }, { app: 'worker' }] }))
      .mockResolvedValueOnce(am({ streams: 100, chunks: 1000, entries: 5000, bytes: 100000 }))
      .mockResolvedValueOnce(am({
        version: '3.4.0',
        revision: 'abc123',
        branch: 'main',
        buildDate: '2026-08-28',
        buildUser: 'builder',
        goVersion: 'go1.23',
      }))
    const client = new MonitoringClient({ lokiBaseUrl: 'http://loki:3100', fetchImpl })

    expect((await client.lokiListLabels({ query: '{app="api"}' })).items).toEqual(['app', 'env'])
    expect((await client.lokiGetLabelValues('env')).items).toEqual(['api', 'worker'])
    expect((await client.lokiListSeries(['{app="api"}', '{job="loki"}'])).items).toHaveLength(2)
    expect(await client.lokiGetIndexStats('{app="api"}')).toMatchObject({
      streams: 100,
      chunks: 1000,
      entries: 5000,
      bytes: 100000,
    })
    expect(await client.lokiGetStatus()).toMatchObject({ connected: true, version: '3.4.0', goVersion: 'go1.23' })

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://loki:3100/loki/api/v1/labels?query=%7Bapp%3D%22api%22%7D',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://loki:3100/loki/api/v1/label/env/values')
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://loki:3100/loki/api/v1/series?match[]=%7Bapp%3D%22api%22%7D&match[]=%7Bjob%3D%22loki%22%7D',
    )
    expect(fetchImpl.mock.calls[3][0]).toBe(
      'http://loki:3100/loki/api/v1/index/stats?query=%7Bapp%3D%22api%22%7D',
    )
    expect(fetchImpl.mock.calls[4][0]).toBe('http://loki:3100/loki/api/v1/status/buildinfo')
  })

  it('maps Loki rule groups, rules, alerts, index volume, volume range, and patterns', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('---\nns1:\n- name: group-a\n  interval: 1m\n', {
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
              query: 'sum(rate({app="api"}[5m]))',
              duration: '5m',
              labels: { severity: 'critical' },
              annotations: { summary: 'CPU high' },
              alerts: [{}],
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
            annotations: { summary: 'CPU high' },
          }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          resultType: 'vector',
          result: [{ metric: { job: 'api' }, value: [1700000000, '1024'] }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [{ metric: { job: 'api' }, values: [[1700000000, '2048'], [1700000060, '4096']] }],
        },
      }))
      .mockResolvedValueOnce(json({
        status: 'success',
        data: [{ pattern: '<_> level=info', samples: [[1711839260, 1], [1711839270, 2]] }],
      }))
    const client = new MonitoringClient({ lokiBaseUrl: 'http://loki:3100', fetchImpl })

    expect((await client.lokiListRuleGroups()).ruleGroupsYaml).toContain('group-a')
    expect((await client.lokiListRules({ type: 'alert', file: 'rules.yaml' })).items[0]).toMatchObject({
      group: 'group-a',
      file: 'rules.yaml',
      name: 'cpu_high',
      type: 'alerting',
      activeAlertCount: 1,
    })
    expect((await client.lokiListAlerts()).items[0]).toMatchObject({
      state: 'firing',
      labelsJson: expect.stringContaining('HighCPU'),
    })
    expect(await client.lokiGetIndexVolume('{job="api"}', {
      start: '1700000000',
      end: '1700003600',
      aggregateBy: 'series',
      targetLabels: 'job',
    })).toMatchObject({
      connected: true,
      resultType: 'vector',
      seriesCount: 1,
      totalBytes: 1024,
    })
    expect(await client.lokiGetIndexVolumeRange('{job="api"}', {
      start: '1700000000',
      end: '1700003600',
      step: '60s',
      limit: 50,
    })).toMatchObject({
      connected: true,
      resultType: 'matrix',
      seriesCount: 1,
      totalBytes: 6144,
    })
    expect((await client.lokiGetPatterns('{job="api"}', {
      start: '1711839260',
      end: '1711839280',
      step: '10s',
    })).items[0]).toMatchObject({
      pattern: '<_> level=info',
      sampleCount: 2,
      totalCount: 3,
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({
      accept: expect.stringContaining('application/yaml'),
    })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://loki:3100/loki/api/v1/rules')
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://loki:3100/prometheus/api/v1/rules?type=alert&file=rules.yaml',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe('http://loki:3100/prometheus/api/v1/alerts')
    expect(fetchImpl.mock.calls[3][0]).toBe(
      'http://loki:3100/loki/api/v1/index/volume?query=%7Bjob%3D%22api%22%7D&start=1700000000&end=1700003600&targetLabels=job&aggregateBy=series',
    )
    expect(fetchImpl.mock.calls[4][0]).toContain(
      '/loki/api/v1/index/volume_range?query=%7Bjob%3D%22api%22%7D&start=1700000000&end=1700003600&step=60s&limit=50',
    )
    expect(fetchImpl.mock.calls[5][0]).toBe(
      'http://loki:3100/loki/api/v1/patterns?query=%7Bjob%3D%22api%22%7D&start=1711839260&end=1711839280&step=10s',
    )
  })

  it('maps Grafana health, datasources, dashboards, and folders', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({ database: 'ok', version: '11.4.0', commit: 'abc123' }))
      .mockResolvedValueOnce(am([{
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
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am([{
        id: 10,
        uid: 'dash-1',
        title: 'Production Overview',
        url: '/d/dash-1/production-overview',
        type: 'dash-db',
        tags: ['prod'],
        isStarred: true,
        folderUid: 'folder-1',
        folderTitle: 'Ops',
      }]))
      .mockResolvedValueOnce(am({
        dashboard: {
          uid: 'dash-1',
          title: 'Production Overview',
          url: '/d/dash-1/production-overview',
          panels: [{ id: 1 }, { id: 2, panels: [{ id: 3 }] }],
        },
        meta: { url: '/d/dash-1/production-overview' },
      }))
      .mockResolvedValueOnce(am([{
        id: 1,
        uid: 'folder-1',
        title: 'Ops',
        url: '/dashboards/f/folder-1/ops',
      }]))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaGetHealth()).toMatchObject({
      connected: true,
      database: 'ok',
      version: '11.4.0',
      commit: 'abc123',
    })
    expect((await client.grafanaListDatasources()).items[0]).toMatchObject({
      uid: 'ds-1',
      name: 'Prometheus',
      isDefault: true,
    })
    expect((await client.grafanaGetDatasource('ds-1')).item).toMatchObject({
      uid: 'ds-1',
      type: 'prometheus',
    })
    expect((await client.grafanaSearchDashboards({
      query: 'prod',
      tag: 'prod',
      starred: true,
      limit: 20,
      page: 1,
    })).items[0]).toMatchObject({
      uid: 'dash-1',
      title: 'Production Overview',
      folderUid: 'folder-1',
      folderTitle: 'Ops',
    })
    expect(await client.grafanaGetDashboard('dash-1')).toMatchObject({
      connected: true,
      uid: 'dash-1',
      title: 'Production Overview',
      panelCount: 3,
    })
    expect((await client.grafanaListFolders()).items[0]).toMatchObject({
      uid: 'folder-1',
      title: 'Ops',
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/health')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/datasources')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/datasources/uid/ds-1')
    expect(fetchImpl.mock.calls[3][0]).toBe(
      'http://grafana:3000/api/search?type=dash-db&query=prod&tag=prod&starred=true&limit=20&page=1',
    )
    expect(fetchImpl.mock.calls[4][0]).toBe('http://grafana:3000/api/dashboards/uid/dash-1')
    expect(fetchImpl.mock.calls[5][0]).toBe('http://grafana:3000/api/folders')
  })

  it('maps Grafana alert rules, contact points, and notification policy', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([{
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
      .mockResolvedValueOnce(am({
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
        paused: true,
        updated: '2026-08-30T00:00:00Z',
        version: 3,
        labels: { severity: 'critical' },
        annotations: { summary: 'CPU high' },
      }))
      .mockResolvedValueOnce(am([{
        uid: 'cp-1',
        name: 'ops-webhook',
        type: 'webhook',
        settings: { url: 'https://example.com/hook' },
        disableResolveMessage: false,
      }]))
      .mockResolvedValueOnce(am({
        receiver: 'ops-webhook',
        group_by: ['alertname'],
        group_wait: '30s',
        group_interval: '5m',
        repeat_interval: '4h',
        routes: [],
      }))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect((await client.grafanaListAlertRules()).items[0]).toMatchObject({
      uid: 'rule-1',
      title: 'High CPU',
      folderUid: 'folder-1',
      namespaceUid: 'ns-1',
      dashboardUid: 'dash-1',
      panelId: 2,
      ruleGroup: 'critical',
      condition: 'C',
      duration: '5m',
      intervalSeconds: 60,
      version: 2,
      dataJson: expect.stringContaining('ds-1'),
      labelsJson: expect.stringContaining('critical'),
    })
    expect(await client.grafanaGetAlertRule('rule-1')).toMatchObject({
      connected: true,
      item: {
        uid: 'rule-1',
        paused: true,
        version: 3,
        ruleJson: expect.stringContaining('High CPU'),
      },
    })
    expect((await client.grafanaListContactPoints()).items[0]).toMatchObject({
      uid: 'cp-1',
      name: 'ops-webhook',
      type: 'webhook',
      settingsJson: expect.stringContaining('example.com'),
    })
    expect(await client.grafanaGetNotificationPolicy()).toMatchObject({
      connected: true,
      receiver: 'ops-webhook',
      groupByJson: expect.stringContaining('alertname'),
      groupWait: '30s',
      groupInterval: '5m',
      repeatInterval: '4h',
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/v1/provisioning/alert-rules')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/v1/provisioning/alert-rules/rule-1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/v1/provisioning/contact-points')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/v1/provisioning/policies')
  })

  it('maps Grafana teams, team members, and org users', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am({
        id: 1,
        orgId: 1,
        name: 'SRE',
        email: 'sre@example.com',
        created: '2026-08-30T00:00:00Z',
        updated: '2026-08-30T01:00:00Z',
      }))
      .mockResolvedValueOnce(am([{
        orgId: 1,
        teamId: 1,
        userId: 10,
        email: 'alice@example.com',
        login: 'alice',
        name: 'Alice',
        avatarUrl: '/avatar/alice',
      }]))
      .mockResolvedValueOnce(am([{
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListTeams({
      query: 'ops',
      sort: 'memberCount-desc',
      page: 1,
      perPage: 10,
    })).toMatchObject({
      connected: true,
      totalCount: 1,
      page: 1,
      perPage: 10,
      items: [{
        id: 1,
        orgId: 1,
        name: 'SRE',
        memberCount: 3,
      }],
    })
    expect(await client.grafanaGetTeam(1)).toMatchObject({
      connected: true,
      item: {
        id: 1,
        name: 'SRE',
        created: '2026-08-30T00:00:00Z',
      },
    })
    expect((await client.grafanaListTeamMembers(1)).items[0]).toMatchObject({
      orgId: 1,
      teamId: 1,
      userId: 10,
      login: 'alice',
    })
    expect((await client.grafanaListOrgUsers()).items[0]).toMatchObject({
      orgId: 1,
      userId: 10,
      role: 'Admin',
      lastSeenAtAge: '2m',
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/teams/search?query=ops&sort=memberCount-desc&page=1&perpage=10',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/teams/1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/teams/1/members')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/org/users')
  })

  it('maps Grafana organizations and organization users', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([
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
      .mockResolvedValueOnce(am({
        id: 2,
        name: 'Secondary Org',
        address: { city: 'Beijing' },
        createdAt: '2026-08-03T00:00:00Z',
        updatedAt: '2026-08-04T00:00:00Z',
      }))
      .mockResolvedValueOnce(am([{
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListOrgs()).toMatchObject({
      connected: true,
      totalCount: 2,
      items: [
        { id: 1, name: 'Main Org', createdAt: '2026-08-01T00:00:00Z' },
        { id: 2, name: 'Secondary Org' },
      ],
    })
    expect(await client.grafanaGetOrg(2)).toMatchObject({
      connected: true,
      id: 2,
      name: 'Secondary Org',
      addressJson: expect.stringContaining('Beijing'),
      orgJson: expect.stringContaining('Secondary Org'),
      updatedAt: '2026-08-04T00:00:00Z',
    })
    expect((await client.grafanaListOrgUsersByOrg(2)).items[0]).toMatchObject({
      orgId: 2,
      userId: 20,
      login: 'bob',
      role: 'Viewer',
      lastSeenAtAge: '5m',
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/orgs')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/orgs/2')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/orgs/2/users')
  })

  it('maps Grafana service accounts, tokens, and org quotas', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am([{
        id: 11,
        name: 'ci-token',
        role: 'Editor',
        created: '2026-08-30T00:00:00Z',
        expiration: null,
        secondsUntilExpiration: 0,
        hasExpired: false,
      }]))
      .mockResolvedValueOnce(am([
        { orgId: 1, target: 'org', limit: -1, used: 1 },
        { orgId: 1, target: 'alertRule', limit: 100, used: 3 },
      ]))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListServiceAccounts({
      query: 'metrics',
      page: 1,
      perPage: 10,
    })).toMatchObject({
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
    expect(await client.grafanaGetServiceAccount(1)).toMatchObject({
      connected: true,
      item: {
        id: 1,
        name: 'metrics',
        isDisabled: false,
      },
    })
    expect((await client.grafanaListServiceAccountTokens(1)).items[0]).toMatchObject({
      id: 11,
      name: 'ci-token',
      role: 'Editor',
      hasExpired: false,
    })
    expect((await client.grafanaListOrgQuotas()).items).toMatchObject([
      { orgId: 1, target: 'org', limit: -1, used: 1 },
      { orgId: 1, target: 'alertRule', used: 3 },
    ])

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/serviceaccounts/search?query=metrics&page=1&perpage=10',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/serviceaccounts/1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/serviceaccounts/1/tokens')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/org/quotas')
  })

  it('maps Grafana folder and datasource permissions', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([
        { id: 1, folderId: 1, role: 'Viewer', permission: 1, permissionName: 'View' },
        { id: 2, folderId: 1, userId: 10, userLogin: 'alice', userEmail: 'alice@example.com', permission: 4, permissionName: 'Admin' },
        { id: 3, folderId: 1, teamId: 5, team: 'SRE', permission: 1, permissionName: 'View' },
      ]))
      .mockResolvedValueOnce(am([
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
        {
          id: 5,
          roleName: 'basic:admin',
          isManaged: false,
          isInherited: false,
          isServiceAccount: false,
          builtInRole: 'Admin',
          actions: ['datasources:query'],
          permission: 'Edit',
        },
      ]))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListFolderPermissions('folder-1')).toMatchObject({
      connected: true,
      items: [
        { role: 'Viewer', permissionName: 'View' },
        { userId: 10, userLogin: 'alice', userEmail: 'alice@example.com' },
        { teamId: 5, team: 'SRE' },
      ],
    })
    expect(await client.grafanaListDatasourcePermissions('ds-1', { dsType: 'prometheus' })).toMatchObject({
      connected: true,
      items: [
        {
          userLogin: 'alice',
          permission: 'Query',
          actionsJson: expect.stringContaining('datasources:read'),
        },
        { builtInRole: 'Admin', permission: 'Edit' },
      ],
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/folders/folder-1/permissions',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/datasources/ds-1?ds_type=prometheus',
    )
  })

  it('maps Grafana dashboard permissions and access control roles', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([
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
        {
          id: 2,
          dashboardId: -1,
          userId: 10,
          userLogin: 'alice',
          userEmail: 'alice@example.com',
          permission: 4,
          permissionName: 'Admin',
          uid: 'dash-1',
        },
      ]))
      .mockResolvedValueOnce(am([
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
      .mockResolvedValueOnce(am({
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListDashboardPermissions('dash-1')).toMatchObject({
      connected: true,
      items: [
        { role: 'Viewer', permissionName: 'View', uid: 'dash-1' },
        { userId: 10, userLogin: 'alice', permissionName: 'Admin' },
      ],
    })
    expect(await client.grafanaListAccessControlRoles({ includeHidden: true })).toMatchObject({
      connected: true,
      items: [{ uid: 'role-1', name: 'fixed:reports:reader', displayName: 'Report reader' }],
    })
    expect(await client.grafanaGetAccessControlRole('role-1')).toMatchObject({
      connected: true,
      item: {
        uid: 'role-1',
        version: 4,
        permissionsJson: expect.stringContaining('reports:read'),
      },
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
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

  it('maps Grafana built-in roles and direct user role assignments', async () => {
    const builtinBody = {
      Viewer: [{ action: 'dashboards:read', scope: 'dashboards:*' }],
      Editor: [{ action: 'dashboards:write', scope: 'dashboards:*' }],
      Admin: [{ action: 'org.users:read', scope: 'users:*' }],
    }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am(builtinBody))
      .mockResolvedValueOnce(am(builtinBody))
      .mockResolvedValueOnce(am([{
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListBuiltinRoles()).toMatchObject({
      connected: true,
      items: [
        { role: 'Viewer', permissionsJson: expect.stringContaining('dashboards:read') },
        { role: 'Editor', permissionsJson: expect.stringContaining('dashboards:write') },
        { role: 'Admin' },
      ],
    })
    expect(await client.grafanaGetBuiltinRole('editor')).toMatchObject({
      connected: true,
      item: {
        role: 'Editor',
        permissionsJson: expect.stringContaining('dashboards:write'),
      },
    })
    expect(await client.grafanaListUserRoles(10)).toMatchObject({
      connected: true,
      userId: 10,
      items: [{ uid: 'role-1', name: 'fixed:reports:reader' }],
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

  it('maps hidden role filters and team role assignments', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([{
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
      .mockResolvedValueOnce(am([{
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      fetchImpl,
    })

    expect(await client.grafanaListUserRoles(10, { includeHidden: true })).toMatchObject({
      connected: true,
      userId: 10,
      items: [{ uid: 'role-1', hidden: true }],
    })
    expect(await client.grafanaListTeamRoles(5, { includeHidden: true })).toMatchObject({
      connected: true,
      teamId: 5,
      items: [{ uid: 'role-2', hidden: false }],
    })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/access-control/users/10/roles?includeHidden=true',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://grafana:3000/api/access-control/teams/5/roles?includeHidden=true',
    )
  })

  it('maps Grafana admin stats, plugins, dashboard versions, and snapshots', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am([{
        id: 'grafana-piechart-panel',
        type: 'panel',
        name: 'Pie Chart',
        version: '2.0.0',
        enabled: true,
        pinned: false,
        hasUpdate: false,
        state: 'beta',
        signature: 'valid',
        info: { author: { name: 'Grafana Labs' } },
      }]))
      .mockResolvedValueOnce(am([{
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
      .mockResolvedValueOnce(am([{
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
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaGetAdminStats()).toMatchObject({
      connected: true,
      users: 3,
      orgs: 2,
      dashboards: 12,
      snapshots: 2,
      datasources: 5,
      playlists: 1,
      stars: 4,
      alerts: 6,
      activeAdmins: 1,
      activeEditors: 2,
      activeViewers: 5,
      activeUsers: 8,
      activeSessions: 9,
      statsJson: expect.stringContaining('activeAdmins'),
    })
    expect((await client.grafanaListPlugins()).items[0]).toMatchObject({
      id: 'grafana-piechart-panel',
      type: 'panel',
      name: 'Pie Chart',
      version: '2.0.0',
      enabled: true,
      signature: 'valid',
      infoJson: expect.stringContaining('Grafana Labs'),
    })
    expect((await client.grafanaListDashboardVersions('dash-1', {
      limit: 5,
      start: 0,
    })).items[0]).toMatchObject({
      id: 101,
      dashboardId: 1,
      version: 3,
      parentVersion: 2,
      createdBy: 'alice',
      updatedBy: 'alice',
      message: 'tuned thresholds',
    })
    expect((await client.grafanaListDashboardSnapshots()).items[0]).toMatchObject({
      id: 201,
      name: 'ops-live',
      key: 'ABC123',
      orgId: 1,
      userId: 10,
      external: true,
      externalUrl: 'https://example.com/s/ABC123',
      expires: '2026-09-01T00:00:00Z',
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://grafana:3000/api/admin/stats')
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/plugins?embedded=true')
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://grafana:3000/api/dashboards/uid/dash-1/versions?limit=5&start=0',
    )
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/dashboard/snapshots')
  })

  it('maps Grafana access control permissions, org preferences, and current user context', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am([
        { action: 'reports:read', scope: 'reports:*' },
        { action: 'dashboards:read', scope: 'dashboards:uid:dash-1' },
      ]))
      .mockResolvedValueOnce(am([
        { action: 'dashboards:edit', scope: 'dashboards:*' },
      ]))
      .mockResolvedValueOnce(am({
        theme: 'dark',
        homeDashboardUID: 'dash-1',
        timezone: 'utc',
        weekStart: 'monday',
      }))
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am([
        { orgId: 1, name: 'Main', role: 'Admin' },
        { orgId: 2, name: 'Ops', role: 'Viewer' },
      ]))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect((await client.grafanaListAccessControlUserPermissions(10, {
      scope: 'reports:*',
    })).items).toMatchObject([
      { action: 'reports:read', scope: 'reports:*' },
      { action: 'dashboards:read', scope: 'dashboards:uid:dash-1' },
    ])
    expect((await client.grafanaListAccessControlTeamPermissions(5)).items[0]).toMatchObject({
      action: 'dashboards:edit',
      scope: 'dashboards:*',
    })
    expect(await client.grafanaGetOrgPreferences()).toMatchObject({
      connected: true,
      theme: 'dark',
      homeDashboardUid: 'dash-1',
      timezone: 'utc',
      weekStart: 'monday',
    })
    expect(await client.grafanaGetCurrentUser()).toMatchObject({
      connected: true,
      id: 10,
      login: 'alice',
      email: 'alice@example.com',
      orgId: 1,
      isGrafanaAdmin: true,
      authLabelsJson: expect.stringContaining('ldap'),
    })
    expect((await client.grafanaListCurrentUserOrgs()).items).toMatchObject([
      { orgId: 1, name: 'Main', role: 'Admin' },
      { orgId: 2, name: 'Ops', role: 'Viewer' },
    ])

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
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

  it('maps Grafana library elements, playlists, and current org', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({
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
      .mockResolvedValueOnce(am({
        result: {
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
          model: { targets: [{ refId: 'A' }] },
          meta: {},
        },
      }))
      .mockResolvedValueOnce(am([{
        id: 1,
        uid: 'pl-1',
        name: 'Ops rotation',
        interval: '5m',
        createdAt: '2026-08-30T00:00:00Z',
        updatedAt: '2026-08-30T01:00:00Z',
      }]))
      .mockResolvedValueOnce(am({
        id: 1,
        uid: 'pl-1',
        name: 'Ops rotation',
        interval: '5m',
        createdAt: '2026-08-30T00:00:00Z',
        updatedAt: '2026-08-30T01:00:00Z',
        items: [{
          id: 1,
          title: 'Overview',
          type: 'dashboard_by_uid',
          value: 'dash-1',
          order: 1,
        }],
      }))
      .mockResolvedValueOnce(am({
        id: 1,
        name: 'Main Org',
        address: { address1: 'Road 1', city: 'Shanghai', country: 'CN' },
      }))
    const client = new MonitoringClient({
      grafanaBaseUrl: 'http://grafana:3000',
      grafanaToken: 'gtok',
      fetchImpl,
    })

    expect(await client.grafanaListLibraryElements({
      searchString: 'cpu',
      type: 'timeseries',
      kind: 'panel',
      perPage: 10,
      page: 1,
    })).toMatchObject({
      connected: true,
      totalCount: 2,
      page: 1,
      perPage: 10,
      items: [{
        uid: 'lib-1',
        name: 'CPU panel',
        kind: 1,
        modelJson: expect.stringContaining('timeseries'),
        metaJson: expect.stringContaining('connectedDashboards'),
      }],
    })
    expect(await client.grafanaGetLibraryElement('lib-1')).toMatchObject({
      connected: true,
      item: {
        uid: 'lib-1',
        name: 'CPU panel',
        version: 3,
        modelJson: expect.stringContaining('targets'),
      },
    })
    expect((await client.grafanaListPlaylists()).items[0]).toMatchObject({
      uid: 'pl-1',
      name: 'Ops rotation',
      interval: '5m',
    })
    expect(await client.grafanaGetPlaylist('pl-1')).toMatchObject({
      connected: true,
      item: {
        uid: 'pl-1',
        name: 'Ops rotation',
        interval: '5m',
        itemsJson: expect.stringContaining('dashboard_by_uid'),
      },
    })
    expect(await client.grafanaGetCurrentOrg()).toMatchObject({
      connected: true,
      id: 1,
      name: 'Main Org',
      addressJson: expect.stringContaining('Shanghai'),
    })

    expect(requestInit(fetchImpl, 0).headers).toMatchObject({ authorization: 'Bearer gtok' })
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://grafana:3000/api/library-elements/search?searchString=cpu&type=timeseries&kind=panel&perPage=10&page=1',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe('http://grafana:3000/api/library-elements/lib-1')
    expect(fetchImpl.mock.calls[2][0]).toBe('http://grafana:3000/api/playlists')
    expect(fetchImpl.mock.calls[3][0]).toBe('http://grafana:3000/api/playlists/pl-1')
    expect(fetchImpl.mock.calls[4][0]).toBe('http://grafana:3000/api/org')
  })

  it('maps Loki detected fields and Grafana annotations and alert instances', async () => {
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
        data: { values: ['debug', 'info', 'warn'], limit: 50 },
      }))
      .mockResolvedValueOnce(am([{
        id: 1124,
        alertId: 0,
        dashboardUID: 'dash-1',
        panelId: 2,
        userId: 1,
        userName: 'alice',
        newState: '',
        prevState: '',
        time: 1507266395000,
        timeEnd: 1507266395000,
        text: 'deploy',
        tags: ['prod', 'api'],
        data: { source: 'ci' },
      }]))
      .mockResolvedValueOnce(am([{
        fingerprint: 'abc',
        startsAt: '2026-08-28T00:00:00Z',
        endsAt: '0001-01-01T00:00:00Z',
        status: { state: 'active' },
        labels: { alertname: 'HighCPU' },
        annotations: { summary: 'CPU high' },
        receivers: [{ name: 'webhook' }],
      }]))
    const client = new MonitoringClient({
      lokiBaseUrl: 'http://loki:3100',
      grafanaBaseUrl: 'http://grafana:3000',
      fetchImpl,
    })

    expect(await client.lokiGetDetectedFields('{job="api"}', {
      start: '1700000000',
      end: '1700003600',
      since: '1h',
      step: '10s',
      lineLimit: 20,
      limit: 10,
    })).toMatchObject({
      connected: true,
      limit: 100,
      items: [{
        label: 'level',
        type: 'string',
        cardinality: 3,
        parsersJson: expect.stringContaining('logfmt'),
      }],
    })
    expect((await client.lokiGetDetectedFieldValues('level', '{job="api"}', {
      start: '1700000000',
      end: '1700003600',
      limit: 50,
    })).items).toEqual(['debug', 'info', 'warn'])
    expect((await client.grafanaListAnnotations({
      from: '1500000000',
      to: '1600000000',
      limit: 20,
      dashboardUid: 'dash-1',
      panelId: 2,
      type: 'annotation',
      tags: ['prod', 'api'],
    })).items[0]).toMatchObject({
      id: 1124,
      dashboardUid: 'dash-1',
      text: 'deploy',
      tagsJson: expect.stringContaining('api'),
    })
    expect((await client.grafanaListAlertInstances({
      active: false,
      receiver: 'webhook',
    })).items[0]).toMatchObject({
      fingerprint: 'abc',
      labelsJson: expect.stringContaining('HighCPU'),
    })

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'http://loki:3100/loki/api/v1/detected_fields?query=%7Bjob%3D%22api%22%7D&start=1700000000&end=1700003600&since=1h&step=10s&line_limit=20&limit=10',
    )
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'http://loki:3100/loki/api/v1/detected_field/level/values?query=%7Bjob%3D%22api%22%7D&start=1700000000&end=1700003600&limit=50',
    )
    expect(fetchImpl.mock.calls[2][0]).toBe(
      'http://grafana:3000/api/annotations?from=1500000000&to=1600000000&limit=20&dashboardUID=dash-1&panelId=2&type=annotation&tags=prod&tags=api',
    )
    expect(fetchImpl.mock.calls[3][0]).toBe(
      'http://grafana:3000/api/alertmanager/grafana/api/v2/alerts?active=false&receiver=webhook',
    )
  })

  it('maps Alertmanager status, alerts, groups, silences, and receivers', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(am({ versionInfo: { version: '0.27.0' }, uptime: '2026-08-28T00:00:00Z' }))
      .mockResolvedValueOnce(am([{
        fingerprint: 'abc',
        startsAt: '2026-08-28T00:00:00Z',
        endsAt: '0001-01-01T00:00:00Z',
        status: { state: 'active', silencedBy: [], inhibitedBy: [] },
        labels: { alertname: 'HighCPU' },
        annotations: { summary: 'CPU high' },
        receivers: [{ name: 'webhook' }],
      }]))
      .mockResolvedValueOnce(am([{ receiver: 'webhook', labels: { alertname: 'HighCPU' }, alerts: [{}] }]))
      .mockResolvedValueOnce(am([{
        id: 'sil-1',
        createdBy: 'bot',
        comment: 'maintenance',
        startsAt: '2026-08-28T00:00:00Z',
        endsAt: '2026-08-28T01:00:00Z',
        matchers: [{ name: 'host', value: 'db-1' }],
        status: { state: 'active' },
      }]))
      .mockResolvedValueOnce(am([{ name: 'webhook' }, { name: 'email' }]))
    const client = new MonitoringClient({ alertmanagerBaseUrl: 'http://am:9093', fetchImpl })

    expect((await client.getAlertmanagerStatus()).version).toBe('0.27.0')
    const alerts = await client.listAlertmanagerAlerts({ filter: 'alertname="HighCPU"', receiver: 'webhook' })
    expect(alerts.items[0]).toMatchObject({
      fingerprint: 'abc',
      labelsJson: expect.stringContaining('HighCPU'),
    })
    expect(fetchImpl.mock.calls[1][0]).toContain('filter=alertname%3D%22HighCPU%22')
    expect((await client.listAlertGroups({ receiver: 'webhook' })).items[0].alertCount).toBe(1)
    expect((await client.listSilences()).items[0].id).toBe('sil-1')
    expect((await client.listReceivers()).items.map(item => item.name)).toEqual(['webhook', 'email'])
  })

  it('gates and executes Alertmanager silence and alert write operations', async () => {
    const fetchImpl = vi.fn()
    const gated = new MonitoringClient({ fetchImpl })
    expect(await gated.createSilence({
      matchers: [{ name: 'severity', value: 'critical' }],
      startsAt: '2026-08-28T00:00:00Z',
      endsAt: '2026-08-28T01:00:00Z',
      createdBy: 'bot',
      comment: 'maintenance',
    })).toMatchObject({ ok: false })
    expect(await gated.deleteSilence('sil-1')).toMatchObject({ ok: false })
    expect(await gated.sendAlerts([{ labels: { alertname: 'X' } }])).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()

    fetchImpl
      .mockResolvedValueOnce(am({ silenceID: 'sil-new' }))
      .mockResolvedValueOnce(am({}))
      .mockResolvedValueOnce(am({ status: 'success' }))
    const allowed = new MonitoringClient({
      alertmanagerBaseUrl: 'http://am:9093',
      allowWrite: true,
      fetchImpl,
    })
    expect(await allowed.createSilence({
      matchers: [{ name: 'severity', value: 'critical' }],
      startsAt: '2026-08-28T00:00:00Z',
      endsAt: '2026-08-28T01:00:00Z',
      createdBy: 'bot',
      comment: 'maintenance',
    })).toEqual({ ok: true, id: 'sil-new' })
    expect(JSON.parse(String(requestInit(fetchImpl, 0).body))).toMatchObject({
      createdBy: 'bot',
      comment: 'maintenance',
    })
    expect(await allowed.deleteSilence('sil-1')).toEqual({ ok: true })
    expect(fetchImpl.mock.calls[1][0]).toBe('http://am:9093/api/v2/silence/sil-1')
    expect(requestInit(fetchImpl, 1).method).toBe('DELETE')
    expect(await allowed.sendAlerts([{ labels: { alertname: 'X' } }])).toEqual({ ok: true })
    expect(JSON.parse(String(requestInit(fetchImpl, 2).body)).alerts).toHaveLength(1)
  })

  it('throws infrastructure errors and keeps HTTP 400 validation errors as write business values', async () => {
    const fetchImpl = vi.fn(async () => json({ message: 'invalid token' }, 401))
    const client = new MonitoringClient({ fetchImpl })
    await expect(client.query('up')).rejects.toThrow(MonitoringError)

    fetchImpl.mockResolvedValueOnce(json({ message: 'bad silence matcher' }, 400))
    const allowed = new MonitoringClient({ allowWrite: true, fetchImpl })
    expect(await allowed.createSilence({
      matchers: [],
      startsAt: 'x',
      endsAt: 'y',
      createdBy: 'bot',
      comment: 'c',
    })).toMatchObject({ ok: false, reason: 'bad silence matcher' })
  })
})
