# dsh-tool-browser

[English](README.md) | [中文](README.zh.md)

这是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 Playwright 浏览器自动化插件。Agent 可以打开允许访问的页面，在隔离会话中导航、读取可见文本、点击控件、填写表单、保存截图并关闭会话。

插件面向没有方便 API 的 Web 应用。每个浏览器上下文归创建它的 Agent 所有，导航和网络子资源都会经过来源白名单检查。

## 安装

~~~sh
npm install @libai168/dsh-tool-browser
npx playwright install chromium
~~~

第二条命令用于安装浏览器二进制文件；插件不会在 npm install 时自动下载浏览器。

插件需要由 dsh 运行时提供 @deepseek-ai/cordis (^4.0.1) 和 @deepseek-ai/dsh-tools (^0.1.0-rc.6)。

## 配置

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

来源条目可以是完整来源、https://*.acme.example 这样的子域名规则，或 http://localhost:* 这样的端口通配规则。allowedOrigins: ['*'] 会允许所有 HTTP(S) 来源，只应在可信且隔离的部署中使用。

完整示例见 [examples/cordis.yml](examples/cordis.yml)。

## 工具

| 工具 | 作用 | 外部副作用 |
|---|---|---|
| browser_open | 打开允许的 URL 并返回不透明会话 ID | 导航 |
| browser_navigate | 在已有会话中导航 | 导航 |
| browser_snapshot | 读取页面或 CSS 区域的有界可见文本 | 无 |
| browser_click | 按 CSS 选择器或可访问角色/名称点击 | 有 |
| browser_fill | 按 CSS 选择器填写输入框或文本域 | 有 |
| browser_screenshot | 在 saveDir 下保存 PNG 或 JPEG | 写本地文件 |
| browser_close | 关闭隔离浏览器上下文 | 释放资源 |

插件不会让模型参数携带 Cookie、凭据或任意请求头。截图文件名只能是简单文件名，不能逃出 saveDir。

## 行为约定

- 默认白名单是 http://localhost:* 和 http://127.0.0.1:*；访问外部网站必须显式加入配置。
- 每次 browser_open 都会创建隔离的 Playwright 上下文。会话 ID 不透明，只有所属 Agent 可以使用。
- 路由守卫会阻止不在白名单中的 HTTP(S) 子资源和重定向；不支持的 URL scheme 和 URL 中的嵌入凭据会被拒绝。
- 浏览器操作遵循 exec.signal；插件卸载时会关闭所有上下文和共享浏览器实例。
- 页面文本受 maxTextBytes 限制；截图只能写入配置目录。
- 工具结果是规范 JSON，展示回调是纯函数，因此调用和结果可以安全重放。

## Model Experience

模型会看到七个小型浏览器工具。通常应先打开页面，再使用 browser_snapshot 查看可见文本，然后选择 CSS 选择器或可访问角色/名称执行操作。后续调用必须携带返回的会话 ID。

页面文本由 maxTextBytes 限制；截图结果只返回文件引用和字节数，不把图片字节塞入工具结果。配置和工具集合不变时，工具 schema 保持稳定。

## 已知限制和后续工作

- MVP 不提供 Cookie 或已保存存储状态导入；需要登录的流程要依赖外部浏览器准备，或等待后续的安全会话提供器。
- 一个会话只有一个活动页面，暂不暴露标签页、下载、文件上传和弹窗。
- 路由守卫按来源检查，网站使用 CDN 或独立身份服务时可能需要额外加入白名单。
- 浏览器二进制文件与平台相关，需要单独运行 Playwright 安装命令。
- 完整无障碍树快照、下拉选择、键盘快捷键和网络拦截暂未提供。

## 开发

~~~sh
npm install
npm run typecheck
npm test
npm run build
~~~

设计说明和发布检查见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 许可证

[MIT](LICENSE)
