# dsh-tool-google-drive

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) Google Workspace read capabilities. Agents can verify credentials, search Drive files, inspect file metadata and sharing/revision history, export Google Workspace file content, list Shared Drives, read Google Docs text, and read Google Sheets metadata/values.

## Install

```sh
npm install @libai168/dsh-tool-google-drive
```

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies.

## Configuration

```yaml
- name: 'github:LJH-snow/dsh-tool-google-drive'
  config:
    accessToken: 'ya29.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    # or OAuth refresh credentials:
    # clientId: 'xxxxxxxx.apps.googleusercontent.com'
    # clientSecret: 'xxxxxxxxxxxxxxxxxxxx'
    # refreshToken: '1//xxxxxxxxxxxxxxxxxxxxxxxx'
    # baseUrl: 'https://www.googleapis.com/drive/v3'
    # tokenUrl: 'https://oauth2.googleapis.com/token'
    # timeoutMs: 15000
```

Recommended read-only OAuth scopes:

- Drive metadata/search: `https://www.googleapis.com/auth/drive.metadata.readonly`
- Drive export/content read: `https://www.googleapis.com/auth/drive.readonly`
- Docs read: `https://www.googleapis.com/auth/documents.readonly`
- Sheets read: `https://www.googleapis.com/auth/spreadsheets.readonly`

Both `baseUrl` and `tokenUrl` overrides must be absolute `http://` or `https://` root URLs. Only publicly reachable hosts are allowed: localhost, loopback, private, link-local, CGNAT, multicast, reserved/documentation/benchmark ranges, and every IANA special-purpose block are rejected, and a hostname whose DNS results contain any such address fails closed before the request is sent. Credentials, query strings, fragments, and non-root paths are not allowed.

## OAuth helper

This package includes a small no-dependency helper that generates a Google OAuth consent URL, captures the loopback callback, exchanges the authorization code, and prints a ready-to-copy Cordis config snippet with a refresh token.

1. In Google Cloud Console, create or select an OAuth client. Add this redirect URI when your client type requires an explicit redirect URI:

   ```text
   http://127.0.0.1:53682/oauth2callback
   ```

2. Run the helper from this repository or from an installed package checkout:

   ```sh
   npm run auth:google -- --client-id 'xxxxxxxx.apps.googleusercontent.com' --client-secret 'xxxxxxxxxxxxxxxxxxxx'
   ```

   If the browser cannot be opened automatically, use `--no-open` and paste the printed URL manually:

   ```sh
   npm run auth:google -- --client-id 'xxxxxxxx.apps.googleusercontent.com' --client-secret 'xxxxxxxxxxxxxxxxxxxx' --no-open
   ```

3. After approval, copy the printed YAML snippet into your `dsh` / Cordis config.

Useful options:

- `--print-url` prints the authorization URL without starting the local callback server or making network calls. The URL never includes the client secret.
- `--redirect-uri` or `--port` changes the callback URL when your OAuth client uses a different loopback URI.
- `--scope` can be repeated, and `--scopes` accepts a space- or comma-separated scope list when you want narrower authorization.
- `--code` exchanges a manually copied authorization code without starting the callback server; pass `--code-verifier` too if the code came from a prior `--print-url` run.

The helper requests offline access with consent prompting so Google can return a refresh token. Keep the client secret and refresh token private; do not commit them to git.

## Tools

| Tool | Description | Write |
|---|---|---|
| `gdrive_auth_test` | Verify Google Drive credentials without returning token material | no |
| `gdrive_list_files` | List or search Drive files by query and pagination | no |
| `gdrive_get_file` | Get one Drive file's metadata by file ID | no |
| `gdrive_list_permissions` | List file/folder/shared-drive sharing permissions with pagination | no |
| `gdrive_list_revisions` | List a file's revision metadata with pagination | no |
| `gdrive_export_file` | Export a Google Workspace file to text or base64 for binary MIME types | no |
| `gdrive_list_shared_drives` | List Shared Drives with pagination and query support | no |
| `gdrive_get_shared_drive` | Get one Shared Drive metadata record | no |
| `gdocs_get_document` | Read a Google Docs document structure and extracted text | no |
| `gsheets_get_spreadsheet` | Read spreadsheet metadata and sheet properties | no |
| `gsheets_get_values` | Read values from one A1 range | no |

## Drive query examples

- `name contains 'report' and trashed = false`
- `mimeType = 'application/pdf' and modifiedTime > '2026-08-01T00:00:00'`
- `fullText contains 'quarterly review'`

## Common workflows

```text
# Search in My Drive or visible Drive items
gdrive_list_files({ query: "name contains 'roadmap' and trashed = false", orderBy: 'modifiedTime desc' })

# Search across Shared Drives
gdrive_list_shared_drives({ pageSize: 20 })
gdrive_list_files({ corpora: 'allDrives', includeItemsFromAllDrives: true, supportsAllDrives: true })

# Export a Google Doc as plain text
gdrive_export_file({ fileId: 'doc_file_id', exportMimeType: 'text/plain' })
gdrive_export_file({ fileId: 'doc_file_id', exportMimeType: 'application/pdf', responseEncoding: 'base64' })

# Inspect sharing and revision history
gdrive_list_permissions({ fileId: 'file_id', pageSize: 50, supportsAllDrives: true })
gdrive_list_revisions({ fileId: 'file_id', pageSize: 50 })

# Read Docs and Sheets directly
gdocs_get_document({ documentId: 'doc_id' })
gsheets_get_spreadsheet({ spreadsheetId: 'spreadsheet_id' })
gsheets_get_values({ spreadsheetId: 'spreadsheet_id', range: 'Sheet1!A1:D20' })
```

Permission and revision listings return an opaque `nextPageToken`; pass it back as `pageToken` to continue. `gdrive_list_permissions` can include shared-drive and domain-admin flags when the OAuth principal has those permissions. Permission email addresses, revision download URLs, and exported content are returned only by explicitly requested read tools; treat them as sensitive workspace data.

Export, Docs, and Sheets content is bounded in the client result layer. Export output accepts maxBytes (default 1 MiB, capped at 10 MiB); Docs accepts maxBytes/maxTabs; Sheets accepts maxRows/maxColumns/maxCells. Results include truncated and contentLength so callers can detect an imposed limit.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
