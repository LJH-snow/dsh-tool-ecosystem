# dsh-tool-dockerhub

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 Docker Hub 只读能力的 Cordis 工具插件。公共搜索无需凭证；配置用户名 + PAT 后可访问私有 namespace 与认证态限流信息。

## 安装

```sh
npm install @libai168/dsh-tool-dockerhub
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖。

## 配置

```yaml
- name: 'github:LJH-snow/dsh-tool-dockerhub'
  config:
    # username: 'docker-user'
    # personalAccessToken: 'dckr_pat_...'
    # baseUrl: 'https://hub.docker.com'
    # timeoutMs: 15000
```

在 Docker Hub 账号设置中创建 personal access token。token 会换取短期 JWT 并仅保存在内存中，任何工具都不会返回它。

`baseUrl` 可选，但必须是带 hostname 的绝对 `http://` 或 `https://` URL。允许反向代理路径前缀，末尾斜杠会被规范化；禁止 URL 用户名、密码、查询字符串和 fragment。每次请求前都会校验最终 host：localhost 名称、环回、私有、链路本地、共享地址/CGNAT、组播，以及全部 IANA 特殊用途地址段（保留、文档、基准测试、`2001::/23` IETF 协议分配段、已废弃的站点本地、SRv6 SID、AS112，以及 IPv4-mapped/NAT64 形式）都会被拒绝。普通域名必须解析到全部允许的公共地址；DNS 失败、空结果或安全/不安全混合结果都会在调用 `fetch` 前 fail closed。

## 工具

全部为只读工具。

| 工具 | 说明 |
|---|---|
| `dockerhub_auth_test` | 验证用户名 + PAT，不回显 token |
| `dockerhub_get_namespace` | 返回所配置 namespace 的摘要 |
| `dockerhub_list_repositories` | 列出 namespace 下的仓库，支持分页与名称过滤 |
| `dockerhub_get_repository` | 按 namespace/name 查看仓库详情 |
| `dockerhub_list_tags` | 列出 tag 及 digest、大小、平台元数据 |
| `dockerhub_get_tag` | 查看单个 tag 的 digest/大小/平台详情 |
| `dockerhub_search_repositories` | 搜索公共仓库（无需凭证） |
| `dockerhub_get_rate_limits` | 读取限流响应头 |

## 错误契约

- 需要凭证但未配置：`{ ok: false }` / `{ found: false, reason }`。
- Docker Hub 错误抛 `DockerHubError`（含状态码与 code），工具层统一转为规范化失败值。
- `page`/`pageSize` 在客户端侧钳制到 1-100。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 许可证

[MIT](LICENSE)
