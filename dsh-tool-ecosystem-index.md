# dsh 插件生态索引

> 自动盘点生成于 2026-10-05，2026-10-06 凌晨随收尾闭环刷新（本索引为快照，最新版本以 npm registry 为准）。
> 所有插件均为 DeepSeek Harness（`dsh`）Cordis 插件，统一约定：凭据只从环境变量读取、写入操作标记 `kind: 'edit'`、输出限长脱敏、Node 22/24 CI、双语 README。

## 收录核验（2026-10-06 凌晨刷新）

- 本地 30 个插件 `package.json` 的 keywords **全部**包含 `awesome-dsh-plugin`。
- 已建仓库 **30 个**（stripe、microsoft-365 已补齐建仓），GitHub topics **全部**包含 `awesome-dsh-plugin`（覆盖率 100%）。
- npm 已发布 **30 个包**，`dist-tags.latest` 与本地版本 **30/30 一致**，无遗留待发布项。
- 30 个仓库均已打 annotated tag `v<version>` 并创建 GitHub Release；stripe/microsoft-365 补齐 Node 22/24 CI（含 `npm pack --dry-run` 门禁）。
- 全生态审计：`.verify/verify-all.sh` 结构校验与测试套件全绿；已发布产物 21/21 通过 56 条端点安全向量；工作树/HEAD/registry 三方审计 30/30 in-sync。详见 [overnight-plan-2026-10-06.md](./overnight-plan-2026-10-06.md)。

## 插件总表

| 插件 | npm latest | 本地版本 | 仓库 | 领域 |
|---|---|---|---|---|
| [dsh-tool-airtable](https://www.npmjs.com/package/@libai168/dsh-tool-airtable) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-airtable) | 低代码数据库 |
| [dsh-tool-aws](https://www.npmjs.com/package/@libai168/dsh-tool-aws) | 0.3.0 | 0.3.0 | [repo](https://github.com/LJH-snow/dsh-tool-aws) | 云基础设施巡检 |
| dsh-tool-browser | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-browser) | 浏览器自动化 |
| [dsh-tool-cloudflare](https://www.npmjs.com/package/@libai168/dsh-tool-cloudflare) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-cloudflare) | 边缘/CDN |
| [dsh-tool-context7](https://www.npmjs.com/package/@libai168/dsh-tool-context7) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-context7) | 实时文档 |
| [dsh-tool-discord](https://www.npmjs.com/package/@libai168/dsh-tool-discord) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-discord) | 社区通信 |
| [dsh-tool-dockerhub](https://www.npmjs.com/package/@libai168/dsh-tool-dockerhub) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-dockerhub) | 镜像仓库 |
| [dsh-tool-feishu](https://www.npmjs.com/package/@libai168/dsh-tool-feishu) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-feishu) | 协作办公 |
| [dsh-tool-figma](https://www.npmjs.com/package/@libai168/dsh-tool-figma) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-figma) | 设计上下文 |
| [dsh-tool-firecrawl](https://www.npmjs.com/package/@libai168/dsh-tool-firecrawl) | 0.2.0 | 0.2.0 | [repo](https://github.com/LJH-snow/dsh-tool-firecrawl) | 网页抓取 |
| [dsh-tool-github](https://www.npmjs.com/package/@libai168/dsh-tool-github) | 0.2.1 | 0.2.1 | [repo](https://github.com/LJH-snow/dsh-tool-github) | 代码托管 |
| [dsh-tool-gitlab](https://www.npmjs.com/package/@libai168/dsh-tool-gitlab) | 0.2.1 | 0.2.1 | [repo](https://github.com/LJH-snow/dsh-tool-gitlab) | 代码托管 |
| [dsh-tool-gmail](https://www.npmjs.com/package/@libai168/dsh-tool-gmail) | 0.4.0 | 0.4.0 | [repo](https://github.com/LJH-snow/dsh-tool-gmail) | 邮件 |
| [dsh-tool-google-drive](https://www.npmjs.com/package/@libai168/dsh-tool-google-drive) | 0.4.1 | 0.4.1 | [repo](https://github.com/LJH-snow/dsh-tool-google-drive) | 云盘 |
| [dsh-tool-jira](https://www.npmjs.com/package/@libai168/dsh-tool-jira) | 0.3.1 | 0.3.1 | [repo](https://github.com/LJH-snow/dsh-tool-jira) | 项目管理 |
| [dsh-tool-kubernetes](https://www.npmjs.com/package/@libai168/dsh-tool-kubernetes) | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-kubernetes) | 容器编排 |
| [dsh-tool-linear](https://www.npmjs.com/package/@libai168/dsh-tool-linear) | 0.4.0 | 0.4.0 | [repo](https://github.com/LJH-snow/dsh-tool-linear) | 项目管理 |
| [dsh-tool-memory](https://www.npmjs.com/package/@libai168/dsh-tool-memory) | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-memory) | 本地知识图谱记忆 |
| [dsh-tool-microsoft-365](https://www.npmjs.com/package/@libai168/dsh-tool-microsoft-365) | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-microsoft-365) | 办公套件 |
| [dsh-tool-mongodb](https://www.npmjs.com/package/@libai168/dsh-tool-mongodb) | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-mongodb) | 文档数据库 |
| [dsh-tool-monitoring](https://www.npmjs.com/package/@libai168/dsh-tool-monitoring) | 0.18.0 | 0.18.0 | [repo](https://github.com/LJH-snow/dsh-tool-monitoring) | 可观测性 |
| [dsh-tool-n8n](https://www.npmjs.com/package/@libai168/dsh-tool-n8n) | 0.4.0 | 0.4.0 | [repo](https://github.com/LJH-snow/dsh-tool-n8n) | 工作流自动化 |
| [dsh-tool-notion](https://www.npmjs.com/package/@libai168/dsh-tool-notion) | 0.4.0 | 0.4.0 | [repo](https://github.com/LJH-snow/dsh-tool-notion) | 知识库 |
| [dsh-tool-pagerduty](https://www.npmjs.com/package/@libai168/dsh-tool-pagerduty) | 0.3.0 | 0.3.0 | [repo](https://github.com/LJH-snow/dsh-tool-pagerduty) | 值班告警 |
| [dsh-tool-redis](https://www.npmjs.com/package/@libai168/dsh-tool-redis) | 0.1.0 | 0.1.0 | [repo](https://github.com/LJH-snow/dsh-tool-redis) | 缓存/键值 |
| [dsh-tool-sentry](https://www.npmjs.com/package/@libai168/dsh-tool-sentry) | 0.2.1 | 0.2.1 | [repo](https://github.com/LJH-snow/dsh-tool-sentry) | 错误追踪 |
| [dsh-tool-slack](https://www.npmjs.com/package/@libai168/dsh-tool-slack) | 0.4.0 | 0.4.0 | [repo](https://github.com/LJH-snow/dsh-tool-slack) | 团队通信 |
| [dsh-tool-sql](https://www.npmjs.com/package/@libai168/dsh-tool-sql) | 0.1.1 | 0.1.1 | [repo](https://github.com/LJH-snow/dsh-tool-sql) | 关系数据库 |
| [dsh-tool-stripe](https://www.npmjs.com/package/@libai168/dsh-tool-stripe) | 0.3.0 | 0.3.0 | [repo](https://github.com/LJH-snow/dsh-tool-stripe) | 支付 |
| [dsh-tool-zendesk](https://www.npmjs.com/package/@libai168/dsh-tool-zendesk) | 0.3.1 | 0.3.1 | [repo](https://github.com/LJH-snow/dsh-tool-zendesk) | 客服工单 |

## 生态约定

- **发现性**：所有包 keywords 与仓库 topics 均含 `awesome-dsh-plugin`（聚合榜单抓取源）。
- **安全基线**：凭据只从环境变量读取；写入工具显式参数 + `kind: 'edit'`；输出限长脱敏；不做危险命令（FLUSH/CONFIG/删除类批量操作等）。
- **发布闭环**：契约核对官方文档/OpenAPI → 离线测试 → Mimosa deep scan → 建仓推送 + topics → Node 22/24 CI → TTY `npm publish`（浏览器一次性授权）→ shasum 对拍 + dist-tags 核验。
- **开发过程记录**：见 [dsh-tool-ecosystem-status.md](./dsh-tool-ecosystem-status.md)。
