# dsh-tool-aws

[English](README.md) | [中文](README.zh.md)

Read-only AWS tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) as a Cordis plugin. The agent can verify credentials and inspect EC2, S3, Lambda, and CloudWatch resources. Requests are signed with AWS Signature Version 4 using WebCrypto.

## Install

```sh
npm install @libai168/dsh-tool-aws
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies.

## Configuration

```yaml
- name: 'github:LJH-snow/dsh-tool-aws'
  config:
    region: 'us-east-1'
    accessKeyId: 'AKIA...'
    secretAccessKey: '...'
    # sessionToken: '...'   # temporary credentials
    # endpoint: '...'       # optional public HTTP(S) root endpoint
    # timeoutMs: 15000
```

The optional `endpoint` must be an absolute `http://` or `https://` root URL (for example, `https://aws-api.example.test/`). Only publicly reachable hosts are allowed. Localhost, loopback, private, link-local, carrier-grade NAT, multicast, and every IANA special-purpose block — reserved/documentation/benchmark ranges, the `2001::/23` IETF protocol assignments prefix, deprecated site-local, SRv6 SIDs, AS112, and IPv4-mapped/NAT64 forms — are rejected, together with hostnames resolving to any such address. Credentials, query strings, fragments, and non-root paths are not allowed. DNS failures are rejected before any request is sent.

Use an IAM user or role with read-only permissions (`ec2:DescribeInstances`, `s3:ListAllMyBuckets`, `lambda:ListFunctions`, `logs:DescribeLogGroups`, `logs:FilterLogEvents`, `cloudwatch:ListMetrics`, `sts:GetCallerIdentity`).

## Tools

All tools are read-only (`kind: 'read'` or `'search'`).

| Tool | Description |
|---|---|
| `aws_sts_get_caller_identity` | Verify credentials and return account/user/ARN |
| `aws_list_ec2_instances` | List EC2 instances with filters and pagination |
| `aws_list_s3_buckets` | List S3 buckets in the account |
| `aws_list_lambda_functions` | List Lambda functions in the region |
| `aws_list_cloudwatch_log_groups` | List CloudWatch log groups with prefix filter |
| `aws_get_cloudwatch_log_events` | Read log events with stream/time-range filters |
| `aws_list_cloudwatch_metrics` | List CloudWatch metrics by namespace/name |
| `aws_ecr_list_repositories` | List ECR repositories in the region |
| `aws_ecr_list_images` | List image tags/digests in one ECR repository |
| `aws_ecr_describe_images` | Describe ECR images with scan status and severity counts |

## Error contract

- Missing credentials: `{ found: false, reason }`.
- AWS-side errors throw `AwsError` with the HTTP status and error code; tools surface them as `{ found: false, reason }`.
- All requests support `timeoutMs` (default 15s) and propagate the caller's `AbortSignal`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
