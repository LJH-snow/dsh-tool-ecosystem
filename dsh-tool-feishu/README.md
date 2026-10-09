# dsh-tool-feishu

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) Feishu/Lark integration capabilities. Agents can list chats, inspect members, read and send messages, list users, browse calendars and events, and review approval instances, details, and task actions.

## Install

```sh
npm install @libai168/dsh-tool-feishu
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies.

## Configuration

```yaml
- name: 'github:LJH-snow/dsh-tool-feishu'
  config:
    appId: 'cli_xxxxxxxxxxxxxxxx'
    appSecret: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    # baseUrl: 'https://open.larksuite.com/open-apis'  # Lark international
    # timeoutMs: 15000
```

The optional `baseUrl` must be an absolute `http://` or `https://` root URL. Only publicly reachable hosts are allowed: localhost, loopback, private, link-local, CGNAT, multicast, reserved/documentation/benchmark ranges, and every IANA special-purpose block are rejected, and a hostname whose DNS results contain any such address fails closed before the request is sent. Credentials, query strings, fragments, and non-root paths are not allowed.

## Tools

| Tool | Description | Write |
|---|---|---|
| `feishu_auth_test` | Verify app credentials and return tenant token metadata | no |
| `feishu_list_chats` | List chats visible to the bot with pagination | no |
| `feishu_get_chat` | Get one chat by ID with name, description, and member count | no |
| `feishu_list_chat_members` | List members of one chat | no |
| `feishu_get_department` | Get one department by ID with name and member count | no |
| `feishu_list_departments` | List departments with pagination | no |
| `feishu_list_department_children` | List child departments under one department | no |
| `feishu_list_messages` | List messages in one chat with optional time range | no |
| `feishu_get_message` | Get one message by ID | no |
| `feishu_send_message` | Send a message to a chat | yes |
| `feishu_get_user` | Get one user by ID with name, email, and status | no |
| `feishu_list_users` | List users in a department with pagination | no |
| `feishu_list_calendars` | List calendars accessible to the bot | no |
| `feishu_list_calendar_events` | List events in one calendar with optional time range | no |
| `feishu_list_approval_instances` | List approval instances with optional filters | no |
| `feishu_get_approval_instance` | Get one approval instance with detail fields and task IDs | no |
| `feishu_approve_approval_task` | Approve one approval task | yes |
| `feishu_reject_approval_task` | Reject one approval task | yes |

## Approval workflow

Typical usage for approvals:

1. Use `feishu_list_approval_instances` to find the instance.
2. Use `feishu_get_approval_instance` to inspect the instance detail and task IDs.
3. Use `feishu_approve_approval_task` or `feishu_reject_approval_task` to act on a task.

The approve/reject tools can resolve `approvalCode` and `instanceCode` from the detail tool when you only pass `instanceId`, `taskId`, and `userId`.

Example flow:

```text
feishu_list_approval_instances({ approvalCode: 'ap_123' })
feishu_get_approval_instance({ instanceId: 'inst_456', userId: 'ou_789' })
feishu_approve_approval_task({ instanceId: 'inst_456', taskId: 'task_1', userId: 'ou_789' })
```

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
