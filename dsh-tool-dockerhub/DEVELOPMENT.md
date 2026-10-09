# dsh-tool-dockerhub 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-dockerhub` |
| 定位 | DeepSeek Harness 的 Docker Hub 只读插件 |
| 版本 | v0.2.0 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | Docker Hub Registry/Hub v2 REST |
| 认证 | username + PAT 换短期 Bearer JWT（内存缓存） |

### 1.1 目录

```text
src/client.ts       DockerHubClient：token 交换与缓存、fetch 注入、超时、错误映射
src/index.ts        8 个 defineTool 定义与插件 apply
tests/client.spec.ts  客户端契约测试（token 交换不回显、分页、认证头）
tests/tools.spec.ts   工具注册、render 测试
examples/cordis.yml   dsh 组合配置示例
```

## 2. 技术决策

### 2.1 认证与 token 安全

- `POST /v2/auth/token` 用 username + PAT 换 JWT，缓存后以 `Authorization: Bearer` 使用；公共搜索不带认证头。
- 任何工具结果都不返回 token 或其片段（v0.1 早期版本曾回显 8 位预览，已移除并有测试兜底）。

### 2.2 语义边界

- `dockerhub_get_namespace` 只返回配置的 namespace 摘要，不再把用户名当作同名仓库查询（Docker Hub 无稳定的 namespace 元数据接口）。
- `page`/`pageSize` 在客户端钳制（page>=1，pageSize 1-100），不信任异常输入。
- 仓库/搜索描述按不可信文本处理，render 限长 200 字符。

### 2.3 baseUrl 与 URL 安全

- `baseUrl` 默认为 `https://hub.docker.com`，只接受带 hostname 的绝对 `http`/`https` URL；允许反向代理路径前缀并规范化尾部斜杠，拒绝 username、password、query 和 fragment。
- 每次 `fetch` 前校验最终 URL 的 host。localhost、`.localhost`、`localhost.localdomain`、`.local`、环回、未指定、私有、链路本地、CGNAT、组播、保留、文档和基准测试 IPv4/IPv6 地址均拒绝。
- 阻断清单与 IANA IPv4/IPv6 Special-Purpose Address Registry 对齐，额外覆盖 `2001::/23`（IETF Protocol Assignments，含 Teredo、AMT、AS112-v6、ORCHID/ORCHIDv2、DRiP）、`5f00::/16`（SRv6 SID）、`100:0:0:1::/64`（RFC 9780）、`2620:4f:8000::/48`、`fec0::/10`（已废弃站点本地）及 IPv4-mapped/NAT64 形式；该清单需与 aws/pagerduty/zendesk 三个同源插件保持一致，不得只改其中一份。
- 普通域名通过 `dns.promises.lookup(hostname, { all: true })` 解析；解析失败、无结果、地址族不一致或任一结果属于阻断地址时 fail closed。`lookupImpl` 只作为 `DockerHubClientOptions` 的测试注入点，不暴露到插件配置接口。
- 安全失败使用不回显 URL、凭证或 bearer token 的固定错误信息。

### 2.4 错误映射

| 场景 | 返回/行为 |
|---|---|
| 未配置凭证 | `{ ok: false, reason }` / `{ found: false, reason }` |
| HTTP 4xx/5xx | 抛 `DockerHubError`，工具层转规范化失败值 |

## 3. 测试

```sh
npm install
npm run typecheck
npm test
npm run build
```

当前 13 个测试覆盖：PAT 交换不回显、分页与 Bearer 认证头、仓库/tag 映射、无凭证公共搜索、限流响应头、缺凭证保护、HTTP 错误映射、工具注册与 render，以及 baseUrl 路径前缀/非法 URL、字面量特殊用途地址（含 IANA 特殊用途网段）、DNS 阻断结果与 fail-closed。

## 4. 后续方向

- 401 时清除缓存 token 并重试一次。
- Repository webhook 只读巡检。
- ECR/GHCR 分别并入 `dsh-tool-aws` 与 `dsh-tool-github`，不在本插件扩展。
