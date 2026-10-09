# dsh-tool-aws

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 AWS 只读巡检能力的 Cordis 工具插件。Agent 可以验证凭证，并查看 EC2、S3、Lambda、CloudWatch 资源。所有请求使用 WebCrypto 实现的 AWS Signature Version 4 签名。

## 安装

```sh
npm install @libai168/dsh-tool-aws
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖。

## 配置

```yaml
- name: 'github:LJH-snow/dsh-tool-aws'
  config:
    region: 'us-east-1'
    accessKeyId: 'AKIA...'
    secretAccessKey: '...'
    # sessionToken: '...'   # 临时凭证
    # endpoint: '...'       # 可选的公共 HTTP(S) 根 endpoint
    # timeoutMs: 15000
```

可选 `endpoint` 必须是绝对的 `http://` 或 `https://` 根地址（例如 `https://aws-api.example.test/`），且主机必须可公共访问。会拒绝 localhost、环回、私有、链路本地、CGNAT、组播，以及全部 IANA 特殊用途地址段（保留/文档/基准测试、`2001::/23` IETF 协议分配段、已废弃的站点本地、SRv6 SID、AS112，以及 IPv4-mapped/NAT64 形式），还有解析到这些地址的域名；不允许 credentials、query、fragment 或非根路径。DNS 解析失败时会在发出请求前拒绝。

建议使用只读权限的 IAM 用户或角色（`ec2:DescribeInstances`、`s3:ListAllMyBuckets`、`lambda:ListFunctions`、`logs:DescribeLogGroups`、`logs:FilterLogEvents`、`cloudwatch:ListMetrics`、`sts:GetCallerIdentity`）。

## 工具

全部为只读工具（`kind: 'read'` 或 `'search'`）。

| 工具 | 说明 |
|---|---|
| `aws_sts_get_caller_identity` | 验证凭证并返回 account/user/ARN |
| `aws_list_ec2_instances` | 列出 EC2 实例，支持过滤与分页 |
| `aws_list_s3_buckets` | 列出账号下的 S3 存储桶 |
| `aws_list_lambda_functions` | 列出区域内的 Lambda 函数 |
| `aws_list_cloudwatch_log_groups` | 按前缀列出 CloudWatch 日志组 |
| `aws_get_cloudwatch_log_events` | 按日志流和时间范围读取日志事件 |
| `aws_list_cloudwatch_metrics` | 按命名空间/指标名列出 CloudWatch 指标 |
| `aws_ecr_list_repositories` | 列出区域内的 ECR 仓库 |
| `aws_ecr_list_images` | 列出一个 ECR 仓库的镜像 tag/digest |
| `aws_ecr_describe_images` | 查看 ECR 镜像详情（大小、扫描状态与漏洞级别计数） |

## 错误契约

- 未配置凭证：`{ found: false, reason }`。
- AWS 侧错误抛 `AwsError`（含 HTTP 状态与错误码），工具层统一转为 `{ found: false, reason }`。
- 所有请求默认 15 秒超时，并透传调用方的 `AbortSignal`。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 许可证

[MIT](LICENSE)
