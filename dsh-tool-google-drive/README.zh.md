# dsh-tool-google-drive

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）提供 Google Workspace 只读集成能力的 Cordis 工具插件。Agent 可以验证凭证、搜索 Drive 文件、查看文件元数据与共享/修订历史、导出 Google Workspace 文件内容、列出共享云端硬盘、读取 Google Docs 文本，以及读取 Google Sheets 元数据/单元格值。

## 安装

```sh
npm install @libai168/dsh-tool-google-drive
```

需要 `@deepseek-ai/cordis`（^4.0.1）与 `@deepseek-ai/dsh-tools`（^0.1.0-rc.6）作为 peer 依赖。

## 配置

```yaml
- name: 'github:LJH-snow/dsh-tool-google-drive'
  config:
    accessToken: 'ya29.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    # 或者使用 OAuth 刷新凭证：
    # clientId: 'xxxxxxxx.apps.googleusercontent.com'
    # clientSecret: 'xxxxxxxxxxxxxxxxxxxx'
    # refreshToken: '1//xxxxxxxxxxxxxxxxxxxxxxxx'
    # baseUrl: 'https://www.googleapis.com/drive/v3'
    # tokenUrl: 'https://oauth2.googleapis.com/token'
    # timeoutMs: 15000
```

推荐的只读 OAuth scopes：

- Drive 元数据/搜索：`https://www.googleapis.com/auth/drive.metadata.readonly`
- Drive 导出/内容读取：`https://www.googleapis.com/auth/drive.readonly`
- Docs 读取：`https://www.googleapis.com/auth/documents.readonly`
- Sheets 读取：`https://www.googleapis.com/auth/spreadsheets.readonly`

`baseUrl` 与 `tokenUrl` 两个覆盖都必须是绝对的 `http://` 或 `https://` 根地址。只允许公网可达主机：localhost、环回、私有、链路本地、CGNAT、组播、保留/文档/基准测试网段以及全部 IANA 特殊用途地址段都会被拒绝；DNS 结果包含任一此类地址时会在发出请求前 fail closed。不允许 credentials、query、fragment 或非根路径。

## OAuth 授权辅助脚本

本包内置一个无额外依赖的辅助脚本：生成 Google OAuth 授权 URL、监听本机回调、用授权码换取 token，并输出可直接复制到 Cordis 配置里的 `refreshToken` 片段。

1. 在 Google Cloud Console 创建或选择 OAuth Client。如果客户端类型需要显式配置回调地址，请加入：

   ```text
   http://127.0.0.1:53682/oauth2callback
   ```

2. 在本仓库或已安装包的工作目录运行：

   ```sh
   npm run auth:google -- --client-id 'xxxxxxxx.apps.googleusercontent.com' --client-secret 'xxxxxxxxxxxxxxxxxxxx'
   ```

   如果无法自动打开浏览器，使用 `--no-open`，然后手动打开终端里打印的 URL：

   ```sh
   npm run auth:google -- --client-id 'xxxxxxxx.apps.googleusercontent.com' --client-secret 'xxxxxxxxxxxxxxxxxxxx' --no-open
   ```

3. 授权完成后，把终端输出的 YAML 片段复制到 `dsh` / Cordis 配置中。

常用选项：

- `--print-url` 只打印授权 URL，不启动本机回调服务，也不发起网络请求；URL 不会包含 client secret。
- `--redirect-uri` 或 `--port` 可在 OAuth Client 使用不同 loopback URI 时调整回调地址。
- `--scope` 可重复传入；`--scopes` 支持空格或逗号分隔的 scope 列表，方便收窄授权范围。
- `--code` 可直接交换手动复制的授权码，不启动回调服务；如果授权码来自之前的 `--print-url` 输出，请同时传入 `--code-verifier`。

脚本会请求 offline access 并强制 consent prompt，以便 Google 返回 refresh token。请妥善保管 client secret 与 refresh token，不要提交到 git。

## 工具

| 工具 | 说明 | 写操作 |
|---|---|---|
| `gdrive_auth_test` | 验证 Google Drive 凭证但不返回 token 内容 | 否 |
| `gdrive_list_files` | 按查询与分页列出或搜索 Drive 文件 | 否 |
| `gdrive_get_file` | 按文件 ID 获取 Drive 文件元数据 | 否 |
| `gdrive_list_permissions` | 分页列出文件、文件夹或共享云端硬盘的共享权限 | 否 |
| `gdrive_list_revisions` | 分页列出文件的修订元数据 | 否 |
| `gdrive_export_file` | 将 Google Workspace 文件导出为文本，或将二进制 MIME 类型导出为 base64 | 否 |
| `gdrive_list_shared_drives` | 列出共享云端硬盘，支持分页与查询 | 否 |
| `gdrive_get_shared_drive` | 获取单个共享云端硬盘元数据 | 否 |
| `gdocs_get_document` | 读取 Google Docs 文档结构与提取文本 | 否 |
| `gsheets_get_spreadsheet` | 读取 Google Sheets 表格元数据与工作表属性 | 否 |
| `gsheets_get_values` | 读取一个 A1 范围内的单元格值 | 否 |

## Drive 查询示例

- `name contains 'report' and trashed = false`
- `mimeType = 'application/pdf' and modifiedTime > '2026-08-01T00:00:00'`
- `fullText contains 'quarterly review'`

## 常见工作流

```text
# 搜索 My Drive 或可见文件
gdrive_list_files({ query: "name contains 'roadmap' and trashed = false", orderBy: 'modifiedTime desc' })

# 跨共享云端硬盘搜索
gdrive_list_shared_drives({ pageSize: 20 })
gdrive_list_files({ corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true })

# 将 Google Docs 导出为纯文本
gdrive_export_file({ fileId: 'doc_file_id', exportMimeType: 'text/plain' })
gdrive_export_file({ fileId: 'doc_file_id', exportMimeType: 'application/pdf', responseEncoding: 'base64' })

# 查看共享权限和修订历史
gdrive_list_permissions({ fileId: 'file_id', pageSize: 50, supportsAllDrives: true })
gdrive_list_revisions({ fileId: 'file_id', pageSize: 50 })

# 直接读取 Docs 与 Sheets
gdocs_get_document({ documentId: 'doc_id' })
gsheets_get_spreadsheet({ spreadsheetId: 'spreadsheet_id' })
gsheets_get_values({ spreadsheetId: 'spreadsheet_id', range: 'Sheet1!A1:D20' })
```

权限和修订列表会返回不透明的 `nextPageToken`；把它作为 `pageToken` 传回即可继续分页。`gdrive_list_permissions` 支持在 OAuth 主体具备权限时传入共享云端硬盘和域管理员参数。权限邮箱、修订下载 URL 以及导出内容只会由明确调用的只读工具返回，请将它们视为敏感工作区数据。

导出、Docs 和 Sheets 内容会在客户端结果层限额。导出支持 maxBytes（默认 1 MiB，最多 10 MiB），Docs 支持 maxBytes/maxTabs，Sheets 支持 maxRows/maxColumns/maxCells。结果包含 truncated 和 contentLength，调用方可识别是否触发限额。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build
```

## 许可证

[MIT](LICENSE)
