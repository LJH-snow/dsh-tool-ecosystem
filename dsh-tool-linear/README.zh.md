# dsh-tool-linear

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 Linear Issue 管理能力的 Cordis 工具插件。Agent 可以通过自然语言搜索和筛选工单、查看工单详情、创建和更新工单、添加和查看评论，并读取团队、项目、Cycle、标签、用户和工作流状态信息。

插件遵循官方「一切皆插件」架构，通过 `ctx.tools.register(defineTool(...))` 注册模型可见工具，并符合 [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) 契约。

## 安装

直接从 GitHub 安装：

```sh
npm install github:LJH-snow/dsh-tool-linear
```

或从本地目录安装：

```sh
git clone https://github.com/LJH-snow/dsh-tool-linear
cd dsh-tool-linear
npm install && npm run build
npm install /path/to/dsh-tool-linear
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖，由宿主 dsh 运行时提供。

## 配置

在 dsh 的组合配置（`cordis.yml`）中加载插件：

```yaml
- name: 'github:LJH-snow/dsh-tool-linear'
  config:
    apiKey: 'lin_api_xxx'              # 必填：Linear 个人 API Key
    baseUrl: 'https://api.linear.app/graphql'  # 可选
    timeoutMs: 15000                    # 可选，默认 15000
```

完整示例见 [examples/cordis.yml](examples/cordis.yml)。

> 安全说明：第一版所有工具都需要 API Key，因为 Linear 工作区有访问控制，而且部分工具会修改工单。请在 Linear Settings > Security & access 创建个人 API Key，授予最小必要权限，不要把凭据写入版本库。

`baseUrl` 覆盖必须是绝对的 `http://` 或 `https://` 根地址。只允许公网可达主机：localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试网段以及全部 IANA 特殊用途地址段都会被拒绝；DNS 结果包含任一此类地址时会在发出请求前 fail closed。不允许 credentials、query、fragment 或非根路径。

## 提供的工具

| 工具 | 说明 | 需要凭据 |
|---|---|---|
| `linear_search_issues` | 按标题、编号、描述或评论内容搜索工单 | 是 |
| `linear_list_issues` | 按团队、项目、Cycle 或工作流状态列出工单 | 是 |
| `linear_get_issue` | 按 UUID 或 `ABC-123` 编号查看工单详情 | 是 |
| `linear_create_issue` | 创建工单：标题、描述、优先级、项目、Cycle、经办人、标签、状态、截止日期 | 是 |
| `linear_update_issue` | 更新标题、描述、优先级、项目、Cycle、经办人、标签、状态或截止日期 | 是 |
| `linear_add_issue_comment` | 给工单添加评论 | 是 |
| `linear_list_issue_comments` | 查看工单评论 | 是 |
| `linear_list_cycles` | 查看团队的 Cycle 列表 | 是 |
| `linear_get_cycle` | 查看 Cycle 详情 | 是 |
| `linear_list_projects` | 查看项目列表，可按团队筛选 | 是 |
| `linear_get_project` | 查看项目详情、日期、进度、健康状态和团队 | 是 |
| `linear_list_teams` | 列出 API Key 可见的团队 | 是 |
| `linear_get_team` | 查看团队详情 | 是 |
| `linear_list_workflow_states` | 查看团队工作流状态，适合选择工单状态 | 是 |
| `linear_list_labels` | 查看标签列表，可按团队筛选 | 是 |
| `linear_get_label` | 查看标签详情 | 是 |
| `linear_list_users` | 查看用户列表，可按姓名、显示名或邮箱筛选 | 是 |
| `linear_get_user` | 查看用户详情 | 是 |

### 行为约定

- 未配置凭据时返回明确业务值：读工具返回 `{ authenticated: false, ... }`，写工具返回 `{ created: false, reason }` 或 `{ ok: false, reason }`。
- 工单、Cycle、项目、团队、标签或用户不存在映射为 `{ found: false }`。
- 写操作的 GraphQL 校验和用户错误映射为 `{ created: false, reason }` 或 `{ ok: false, reason }`。
- 凭据无效（401）、访问禁止（403）、限流（429）、服务器错误（5xx）等基础设施错误直接抛出 `LinearError`。
- 每个请求都透传 `exec.signal`，并使用可配置超时（默认 15 秒）。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

架构与测试计划见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## License

[MIT](LICENSE)
