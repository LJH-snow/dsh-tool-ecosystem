# dsh-tool-browser

[English](README.md) | [中文](README.zh.md)

A Playwright browser-automation plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh). Agents can open allowlisted pages, navigate isolated sessions, read visible text, click controls, fill forms, save screenshots, and close sessions.

The plugin targets web applications without a convenient API. Each browser context belongs to the Agent that created it, and navigation plus routed subresources are checked against the configured origin allowlist.

## Install

~~~sh
npm install @libai168/dsh-tool-browser
npx playwright install chromium
~~~

The second command installs the selected browser binary. The package does not download a browser during npm install.

Requires @deepseek-ai/cordis (^4.0.1) and @deepseek-ai/dsh-tools (^0.1.0-rc.6) as peer dependencies.

## Configuration

~~~yaml
- name: '@libai168/dsh-tool-browser'
  config:
    allowedOrigins:
      - 'https://example.com'
      - 'https://*.acme.example'
    browserType: chromium
    # Optional absolute path to a system browser.
    # executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    headless: true
    timeoutMs: 30000
    maxSessions: 4
    maxTextBytes: 12000
    saveDir: '.dsh-browser'
~~~

An origin entry may be an exact origin, a subdomain rule such as https://*.acme.example, or a port wildcard such as http://localhost:*. Setting allowedOrigins to ['*'] permits every HTTP(S) origin and should only be used in a trusted, isolated deployment.

Full example: [examples/cordis.yml](examples/cordis.yml).

## Tools

| Tool | Description | External side effect |
|---|---|---|
| browser_open | Open an allowlisted URL and return an opaque session id | navigation |
| browser_navigate | Navigate an existing session | navigation |
| browser_snapshot | Read bounded visible text from the body or a CSS region | no |
| browser_click | Click a CSS selector or accessible role/name target | yes |
| browser_fill | Fill an input or textarea selected by CSS | yes |
| browser_screenshot | Save a PNG or JPEG below saveDir | writes a local file |
| browser_close | Close one isolated browser context | releases resources |

The plugin never accepts cookies, credentials, or arbitrary request headers as model arguments. Screenshot names are simple file names and cannot escape saveDir.

## Behavior contract

- The default allowlist is http://localhost:* and http://127.0.0.1:*; external sites must be added explicitly.
- Each browser_open creates an isolated Playwright context. Session ids are opaque and only usable by the owning Agent.
- A route guard blocks disallowed HTTP(S) subresources and redirects. Unsupported URL schemes and embedded URL credentials are rejected.
- exec.signal is observed by browser operations. Plugin disposal closes every context and the shared browser instance.
- Page text is capped by maxTextBytes; screenshots are written only below the configured directory.
- Tool results are canonical JSON and presentation callbacks are pure, so calls and results remain replayable.

## Model Experience

The model sees seven small browser tools. It should open a page first, use browser_snapshot to inspect visible text, then choose a selector or accessible role/name for an action. The returned session id is required for later calls.

browser_snapshot is bounded by maxTextBytes. Screenshots return a file reference and byte count rather than image bytes in the tool result. Browser tool schemas are fixed per deployment.

## Known Limitations and Deferred Work

- The MVP has no cookie or saved-storage import, so authenticated workflows need an external browser setup or a future credential-safe session provider.
- A session has one active page; tabs, downloads, file uploads, and popups are not exposed yet.
- The route guard is origin-based and may require adding origins for a site's CDN or identity provider.
- Browser binaries are platform-specific and must be installed separately with Playwright.
- Accessibility-tree snapshots, select menus, keyboard shortcuts, and network interception are deferred.

## Development

~~~sh
npm install
npm run typecheck
npm test
npm run build
~~~

See [DEVELOPMENT.md](DEVELOPMENT.md) for design notes and release checks.

## Publishing

1. Run typecheck, test, and build.
2. Run npm pack --dry-run and confirm that lib/ and the documentation are included.
3. Publish with npm publish --access public.
4. Add the dsh-plugin topic to the repository for ecosystem discovery.

## License

[MIT](LICENSE)
