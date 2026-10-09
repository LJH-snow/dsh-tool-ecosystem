# dsh-tool-github

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 GitHub 能力的 Cordis 工具插件。Agent 可以通过自然语言查询仓库、搜索代码、查看 issue、创建 draft PR。

基于官方「一切皆插件」架构，通过 `ctx.tools.register(defineTool(...))` 注册模型可见工具，完全遵循官方 [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) 契约。

## 安装

直接从 GitHub 安装（无需发布 npm）：

```sh
npm install github:LJH-snow/dsh-tool-github
# 或指定分支/标签
npm install github:LJH-snow/dsh-tool-github#main
```

或从本地目录安装：

```sh
git clone https://github.com/LJH-snow/dsh-tool-github
cd dsh-tool-github
npm install && npm run build   # 构建到 lib/
npm install /path/to/dsh-tool-github
```

> 发布到 npm 后，也可用 `npm install @libai168/dsh-tool-github` 安装。

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖，由宿主 dsh 运行时提供。

## 配置

在 dsh 的组合配置（`cordis.yml`）中加载插件：

```yaml
- name: 'dsh-tool-github'
  config:
    token: 'ghp_xxx'        # GitHub PAT（可选；代码搜索与创建 PR 需要）
    baseUrl: 'https://api.github.com'   # 可选，GitHub Enterprise 可覆盖
    timeoutMs: 15000        # 可选，请求超时（毫秒），默认 15000
```

完整示例见 [examples/cordis.yml](examples/cordis.yml)。

> *workflow runs 对公开仓库无需 token，私有仓库需要。
>
> 安全建议：查询类工具无需 token；代码搜索（`github_search_code`）与创建 PR（`github_create_pr_draft`）需要 token。建议使用最小权限的 fine-grained token，避免把 token 写入版本库。

每次请求前都会校验目标地址。链路本地地址（`169.254.0.0/16`、`fe80::/10`，含其 IPv4-mapped 与 NAT64 形式）始终被拒绝——它们不可能是合法的 API 端点，且包含云元数据地址。内网自建端点默认保持可用。设置 `enforcePublicEndpoint: true` 可额外要求主机公网可达；该模式还会解析普通域名，并拒绝环回、私有、CGNAT、组播、保留以及全部 IANA 特殊用途地址段。

## 提供的工具

| 工具 | 说明 | 需要 token |
|---|---|---|
| `github_get_repo` | 查询仓库元信息（描述、star、语言、license、主页、更新时间） | 否 |
| `github_search_repos` | 按关键词搜索仓库（排序 stars/forks/updated，结果上限 10） | 否 |
| `github_list_issues` | 列出仓库 issue（state/label 过滤，结果上限 20） | 否 |
| `github_search_code` | 搜索代码；未配置 token 时返回明确提示 | 是 |
| `github_list_prs` | 列出仓库 PR（state 过滤，上限 20） | 否 |
| `github_get_file` | 读取仓库文件内容（支持分支/ref，base64 解码） | 否 |
| `github_list_commits` | 查看最近提交（分支/作者过滤，上限 30） | 否 |
| `github_create_issue` | 创建 issue（title 必填，body/labels 可选） | 是 |
| `github_comment_issue` | 评论 issue 或 PR | 是 |
| `github_update_issue` | 打开/关闭 issue | 是 |
| `github_merge_pr` | 合并 PR（merge/squash/rebase；需 token） | 是 |
| `github_list_releases` | 列出发布（tag、draft/prerelease、作者） | 否 |
| `github_list_branches` | 列出分支及最新 SHA | 否 |
| `github_get_issue` | 查看 issue 详情（标题、状态、作者、标签、body） | 否 |
| `github_list_issue_comments` | 列出 issue 评论（作者、时间、内容） | 否 |
| `github_list_milestones` | 列出仓库 milestone（状态过滤、截止日期、issue 数量） | 否 |
| `github_list_pr_comments` | 列出 PR review 评论（作者、时间、内容） | 否 |
| `github_set_issue_labels` | 覆盖设置 issue/PR 的完整标签列表 | 是 |
| `github_add_issue_assignees` | 给 issue/PR 添加 GitHub 用户 | 是 |
| `github_set_issue_milestone` | 设置或清除 issue/PR 的 milestone | 是 |
| `github_reply_pr_comment` | 回复已有的 PR review 评论 | 是 |
| `github_get_pull_request` | 查看 PR 详情（分支、合并状态、评审结论、改动统计） | 否 |
| `github_list_pull_request_reviews` | 列出 PR 评审（评审人、状态、内容、时间） | 否 |
| `github_request_pr_reviewers` | 邀请用户或团队评审 PR | 是 |
| `github_submit_pr_review` | 批准、请求修改或评论 PR | 是 |
| `github_get_user` | 查询用户/组织信息（名称、bio、粉丝、仓库数） | 否 |
| `github_get_org` | 查询组织资料与仓库数量 | 否 |
| `github_list_org_repos` | 列出组织仓库（含可见性信息） | 否 |
| `github_list_org_members` | 列出组织成员 | 是 |
| `github_list_org_teams` | 列出组织团队 | 是 |
| `github_get_team` | 按 slug 查询组织团队 | 是 |
| `github_list_team_members` | 列出团队内成员 | 是 |
| `github_list_team_repos` | 列出团队可访问仓库 | 是 |
| `github_update_team_membership` | 添加团队成员或修改角色 | 是 |
| `github_remove_team_membership` | 从组织团队移除用户 | 是 |
| `github_list_collaborators` | 列出仓库协作者及有效权限 | 是 |
| `github_get_collaborator_permission` | 查看单个协作者权限与来源 | 是 |
| `github_add_collaborator` | 邀请或添加仓库协作者并设置权限 | 是 |
| `github_update_collaborator_permission` | 更新现有协作者权限 | 是 |
| `github_remove_collaborator` | 从仓库移除直接协作者 | 是 |
| `github_add_team_repo` | 授予组织团队仓库访问权限 | 是 |
| `github_remove_team_repo` | 移除组织团队对仓库的访问权限 | 是 |
| `github_list_repo_webhooks` | 列出仓库 webhook（事件、配置、投递端点） | 是 |
| `github_get_repo_webhook` | 查看单个仓库 webhook 配置 | 是 |
| `github_create_repo_webhook` | 创建仓库 webhook（事件、secret、内容类型、启用状态） | 是 |
| `github_update_repo_webhook` | 更新 webhook URL、事件、secret 或启用状态 | 是 |
| `github_delete_repo_webhook` | 删除仓库 webhook | 是 |
| `github_ping_repo_webhook` | 向仓库 webhook 发送 ping | 是 |
| `github_list_release_assets` | 列出 Release 资产（大小、下载次数、下载 URL） | 是 |
| `github_get_release_asset` | 查看单个 Release 资产元信息 | 是 |
| `github_update_release_asset` | 重命名 Release 资产或更新显示标签 | 是 |
| `github_delete_release_asset` | 删除 Release 资产 | 是 |
| `github_list_workflow_runs` | 查看 Actions 运行（workflow、分支、状态） | 否* |
| `github_list_workflows` | 查看仓库 Actions workflows（名称、路径、状态） | 否* |
| `github_get_workflow` | 查看单个 workflow 详情 | 否* |
| `github_get_workflow_run` | 查看 workflow run 详情 | 否* |
| `github_list_workflow_jobs` | 查看 run 的 job 与步骤 | 否* |
| `github_get_workflow_run_logs` | 下载并解码 workflow run 日志（上限 20 万字符） | 否* |
| `github_list_repo_artifacts` | 列出仓库 Actions artifacts（过期时间、下载元信息） | 是 |
| `github_list_run_artifacts` | 列出 workflow run 产生的 artifacts | 是 |
| `github_get_artifact` | 查看单个 Actions artifact 及 archive 下载 URL | 是 |
| `github_delete_artifact` | 删除 Actions artifact | 是 |
| `github_rerun_workflow_run` | 重新运行 workflow run | 是 |
| `github_cancel_workflow_run` | 取消进行中的 workflow run | 是 |
| `github_dispatch_workflow` | 触发 workflow_dispatch（ref + 字符串 inputs） | 是 |
| `github_create_branch` | 创建分支（从指定 ref） | 是 |
| `github_write_file` | 创建/更新文件（自动提交） | 是 |
| `github_list_environments` | 列出部署环境、保护规则与分支策略 | 是 |
| `github_get_environment` | 查看单个部署环境及其策略 | 是 |
| `github_update_environment` | 创建/更新等待时间、评审人与分支策略 | 是 |
| `github_delete_environment` | 删除部署环境 | 是 |
| `github_get_readme` | 读取仓库 README（markdown） | 否 |
| `github_list_tags` | 列出版本标签 | 否 |
| `github_star_repo` | star 仓库 | 是 |
| `github_unstar_repo` | 取消 star | 是 |
| `github_create_release` | 为 tag 创建 Release | 是 |
| `github_create_repository` | 创建用户或组织仓库 | 是 |
| `github_set_repo_topics` | 设置仓库完整 topics 列表 | 是 |
| `github_list_gists` | 列出当前用户/公开 gist | 否 |
| `github_create_gist` | 创建公开或私有 gist | 是 |
| `github_list_repo_variables` | 查看 Actions 仓库 variables | 是 |
| `github_set_repo_variable` | 创建/更新 Actions 仓库 variable | 是 |
| `github_delete_repo_variable` | 删除 Actions 仓库 variable | 是 |
| `github_list_repo_secrets` | 查看 Actions 仓库 secret 元信息 | 是 |
| `github_set_repo_secret` | 创建/更新 Actions 仓库 secret（本地加密后上传） | 是 |
| `github_delete_repo_secret` | 删除 Actions 仓库 secret | 是 |
| `github_get_branch_protection` | 查询分支保护规则 | 否 |
| `github_set_branch_protection` | 更新分支保护规则 | 是 |
| `github_delete_branch_protection` | 删除分支保护规则 | 是 |
| `github_create_pr_draft` | 创建 draft PR（head/base/title/body） | 是 |

### 行为约定（遵循官方 execute 契约）

- **业务失败用规范值表达**：仓库不存在 → `{ found: false }`；PR 创建失败（分支不存在/已存在）→ `{ created: false, reason }`。
- **基础设施错误才抛错**：token 无效（401）、限流（403）等直接抛出，由调用方感知。
- **取消可中断**：所有请求透传 `exec.signal`，并叠加默认 15s 超时。

## 开发

```sh
npm install
npm run typecheck   # 类型检查
npm test            # 单元测试（vitest）
npm run build       # 构建到 lib/
```

开发计划、决策记录见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 发布与生态

1. 发布使用你的 npm scope：`@libai168/dsh-tool-github`（npm 发布需要启用 **2FA bypass** 的 granular access token，或 trusted publishing）。
2. `npm run build` 后执行 `npm publish --access public`。
3. 为你的 GitHub 仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic，便于生态发现。

## License

[MIT](LICENSE)
