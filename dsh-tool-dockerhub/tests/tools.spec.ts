import { describe, expect, it } from 'vitest'
import { DockerHubClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

describe('dsh-tool-dockerhub tools', () => {
  it('registers eight read-only tools', () => {
    expect(createTools(new DockerHubClient()).map(tool => tool.name)).toEqual([
      'dockerhub_auth_test',
      'dockerhub_get_namespace',
      'dockerhub_list_repositories',
      'dockerhub_get_repository',
      'dockerhub_list_tags',
      'dockerhub_get_tag',
      'dockerhub_search_repositories',
      'dockerhub_get_rate_limits',
    ])
  })

  it('keeps auth and namespace tools safe without credentials', async () => {
    const tools = createTools(new DockerHubClient())
    const auth = tools.find(tool => tool.name === 'dockerhub_auth_test')!
    const namespace = tools.find(tool => tool.name === 'dockerhub_get_namespace')!
    expect(await auth.execute({}, {})).toMatchObject({ ok: false, reason: 'Docker Hub username and personalAccessToken are not configured.' })
    expect(await namespace.execute({}, {})).toMatchObject({ found: false, reason: 'Docker Hub username and personalAccessToken are not configured.' })
  })

  it('renders repository, tag, and rate-limit results', () => {
    const tools = createTools(new DockerHubClient())
    const repositories = tools.find(tool => tool.name === 'dockerhub_list_repositories')!
    const repositoryView = repositories.output.render({}, { found: true, items: [{ namespace: 'octocat', name: 'demo', pullCount: 12, starCount: 2, isPrivate: false, lastUpdated: 'today', description: 'Demo' }] }) as Array<{ text: string }>
    expect(repositoryView[0].text).toContain('octocat/demo pulls=12 stars=2 private=no')

    const tags = tools.find(tool => tool.name === 'dockerhub_get_tag')!
    const tagView = tags.output.render({}, { found: true, name: 'latest', digest: 'sha256:abc', fullSize: 100, architecture: 'amd64', os: 'linux' }) as Array<{ text: string }>
    expect(tagView[0].text).toContain('latest')
    expect(tagView[0].text).toContain('digest=sha256:abc')

    const namespace = tools.find(tool => tool.name === 'dockerhub_get_namespace')!
    const namespaceView = namespace.output.render({}, { found: true, namespace: 'octocat', authenticated: true }) as Array<{ text: string }>
    expect(namespaceView[0].text).toContain('namespace=octocat authenticated=yes')

    const limits = tools.find(tool => tool.name === 'dockerhub_get_rate_limits')!
    const limitView = limits.output.render({}, { found: true, limit: '200', remaining: '199', reset: '1', authenticated: false }) as Array<{ text: string }>
    expect(limitView[0].text).toContain('limit=200 remaining=199')
  })
})
