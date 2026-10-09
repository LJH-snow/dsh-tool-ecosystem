# dsh-tool-feishu

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供飞书/Lark 集成能力的 Cordis 工具插件。Agent 可以查看群组、成员、收发消息、查看用户、浏览日历与事件、查看审批实例、审批详情，以及执行通过/拒绝操作。

## 安装

```sh
npm install @libai168/dsh-tool-feishu
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖。

## 配置

```yaml
- name: 'github:LJH-snow/dsh-tool-feishu'
  config:
    appId: 'cli_xxxxxxxxxxxxxxxx'
    appSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    # baseUrl: 'https://open.larksuite.com/open-apis'  # Lark 国际版
    # timeoutMs: 15000
```

可选 `baseUrl` 必须是绝对的 `http://` 或 `https://` 根地址。只允许公网可达主机：localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试网段以及全部 IANA 特殊用途地址段都会被拒绝；DNS 结果包含任一此类地址时会在发出请求前 fail closed。不允许 credentials、query、fragment 或非根路径。

## 工具

| 工具 | 说明 | 写操作 |
|---|---|---|
| `feishu_auth_test` | 验证应用凭证并返回 tenant token 元数据 | 否 |
| `feishu_list_chats` | 查看 bot 可见的群组列表，支持分页 | 否 |
| `feishu_get_chat` | 按 ID 查看单个群组，含名称、描述与成员数 | 否 |
| `feishu_list_chat_members` | 查看某个群组的成员列表 | 否 |
| `feishu_get_department` | 按 ID 查看部门，含名称与成员数 | 否 |
| `feishu_list_departments` | 查看部门列表，支持分页 | 否 |
| `feishu_list_department_children` | 查看某部门下的子部门列表 | 否 |
| `feishu_list_messages` | 查看某个群组的消息，支持时间范围过滤 | 否 |
| `feishu_get_message` | 按 ID 查看单条消息 | 否 |
| `feishu_send_message` | 向群组发送消息 | 是 |
| `feishu_get_user` | 按 ID 查看用户，含姓名、邮箱与状态 | 否 |
| `feishu_list_users` | 查看部门下的用户列表，支持分页 | 否 |
| `feishu_list_calendars` | 查看 bot 可访问的日历列表 | 否 |
| `feishu_list_calendar_events` | 查看某个日历的事件，支持时间范围过滤 | 否 |
| `feishu_list_approval_instances` | 查看审批实例，支持过滤与分页 | 否 |
| `feishu_get_approval_instance` | 查看单个审批实例详情与任务 ID | 否 |
| `feishu_approve_approval_task` | 通过一个审批任务 | 是 |
| `feishu_reject_approval_task` | 拒绝一个审批任务 | 是 |

## 审批工作流

典型用法：

1. 先用 `feishu_list_approval_instances` 找到目标实例。
2. 再用 `feishu_get_approval_instance` 查看实例详情与任务 ID。
3. 最后用 `feishu_approve_approval_task` 或 `feishu_reject_approval_task` 处理任务。

如果只传 `instanceId`、`taskId`、`userId`，通过/拒绝工具会根据详情工具自动补全 `approvalCode` 和 `instanceCode`。

示例流程：

```text
feishu_list_approval_instances({ approvalCode: 'ap_123' })
feishu_get_approval_instance({ instanceId: 'inst_456', userId: 'ou_789' })
feishu_approve_approval_task({ instanceId: 'inst_456', taskId: 'task_1', userId: 'ou_789' })
```

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 许可证

[MIT](LICENSE)
