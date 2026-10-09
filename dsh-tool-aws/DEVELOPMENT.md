# dsh-tool-aws 开发文档

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-aws` |
| 定位 | DeepSeek Harness 的 AWS 只读巡检插件 |
| 版本 | v0.3.0 |
| 架构 | Cordis 插件 + `ctx.tools.register(defineTool(...))` |
| API | STS / EC2 Query(XML)、S3 REST(XML)、Lambda JSON、CloudWatch Logs/Monitoring Query(XML) |
| 认证 | AWS SigV4（WebCrypto HMAC-SHA256） |

### 1.1 目录

```text
src/signer.ts       SigV4 签名器：canonical request、string-to-sign、签名头
src/url-security.ts endpoint 规范化、主机/DNS/IP 安全校验
src/client.ts       AwsClient：Query/XML 解析、fetch 注入、超时、错误映射
src/index.ts        10 个 defineTool 定义与插件 apply
tests/client.spec.ts  客户端契约测试（含固定时间 SigV4 签名对照）
tests/tools.spec.ts   工具注册、凭证保护、render 测试
examples/cordis.yml   dsh 组合配置示例
```

## 2. 技术决策

### 2.1 签名

- SigV4 使用 WebCrypto（Node 22+ 全局可用），签名链 `kDate -> kRegion -> kService -> kSigning` 每步使用原始字节而非 hex 字符串。
- 测试用 Node `node:crypto` 的独立参考实现对拍固定时间的 Authorization 头。
- Query API 以 `application/x-www-form-urlencoded` POST 发送；EC2/STS/Logs/Monitoring 返回 XML，由内置轻量 parser 解析并拆除 `*Response`/`*Result` 包装。
- S3 ListBuckets 走 `s3.amazonaws.com` 全局 REST 端点；Lambda 走 JSON API，分页 `Marker` 作为 canonical query 参与签名。
- `endpoint` 配置对所有服务生效，并规范化为 origin；必须是绝对 `http://` 或 `https://` 根地址（仅 `/` 路径），不能包含 credentials、query 或 fragment。
- 发起 fetch 前会对最终 URL 做 fail-closed 主机校验：拒绝 localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试地址；普通域名使用 `dns.promises.lookup(hostname, { all: true })`，解析失败、无结果或任一结果被阻断都会拒绝。生产代码使用系统 DNS，测试可通过 `AwsClientOptions.lookupImpl` 注入稳定结果；该字段不属于插件配置接口。阻断清单与 IANA IPv4/IPv6 Special-Purpose Address Registry 对齐：除上述类别外，额外覆盖 `2001::/23`（IETF Protocol Assignments，含 Teredo、AMT、AS112-v6、ORCHID/ORCHIDv2、DRiP）、`5f00::/16`（SRv6 SID）、`100:0:0:1::/64`（RFC 9780）、`2620:4f:8000::/48`、`fec0::/10`（已废弃站点本地）以及 IPv4-mapped/NAT64 形式；该清单需与 dockerhub/pagerduty/zendesk 三个同源插件保持一致，不得只改其中一份。

### 2.2 已知边界

- Query API 的列表型参数（如 Filter/InstanceId）已按 `.N` 编号展开；`FilterLogEvents` 的 `logStreamNames` 使用 `logStreamNames.member.1` 形式。
- ECR 走 `application/x-amz-json-1.1` + `X-Amz-Target` 的 JSON RPC 形式（`api.ecr.<region>.amazonaws.com`，签名 service 为 `ecr`）。
- EC2 filters 参数以 `filtersJson` 字符串传入，非法 JSON 返回 `{ found: false }`。
- 未实现写操作；S3 region 行为按全局端点约定，多区域精细签名留待后续。

### 2.3 错误映射

| 场景 | 返回/行为 |
|---|---|
| 未配置凭证 | `{ found: false, reason }` |
| AWS 4xx/5xx | 抛 `AwsError`，工具层转 `{ found: false, reason }` |

## 3. 测试

```sh
npm install
npm run typecheck
npm test
npm run build
```

当前 24 个测试覆盖：STS 身份映射、EC2 过滤/分页/tag、S3 XML 解析、Lambda 分页、CloudWatch 日志组/事件/指标、ECR 仓库/镜像/扫描详情（含 x-amz-json 协议头断言）、缺凭证保护、HTTP 错误映射、固定时间 SigV4 签名对照，以及安全自定义根 endpoint、非法 endpoint、literal/DNS 阻断地址和 DNS fail-closed（均断言 fetch 不会调用）。

## 4. 后续方向

- SigV4 用 AWS 官方测试向量复核 canonical headers 细节。
- 按服务区域端点自动签名（S3 非 us-east-1）。
