# dsh-tool-browser 开发文档

## 1. 项目概览

| 项目 | 说明 |
|---|---|
| 项目名 | dsh-tool-browser |
| 发布名 | @libai168/dsh-tool-browser |
| 定位 | DeepSeek Harness 的 Playwright 浏览器自动化插件 |
| 工具数 | 7 |
| 架构 | BrowserClient 管理浏览器生命周期，createTools 注册模型工具 |
| 默认浏览器 | Chromium |

## 2. 设计决策

### 2.1 会话隔离

每个 browser_open 创建一个独立 BrowserContext，并记录创建它的 Agent id。后续调用必须使用相同 Agent id；插件卸载时统一关闭上下文和浏览器。

### 2.2 来源白名单

构造客户端时把来源规则解析为协议、主机和端口。可通过 executablePath 指向系统浏览器，避免依赖 Playwright 的下载缓存。导航入口和 BrowserContext.route 都检查来源，避免页面重定向或子资源绕过入口检查。默认只允许本机端口，通配全部来源需要显式配置星号。

### 2.3 文件安全

截图只接受简单文件名，目标路径固定在 saveDir 下。模型不会直接控制 Cookie、凭据和任意请求头。

### 2.4 测试注入

BrowserClient 接受 BrowserLauncher，测试通过假的 Browser、Context、Page 和 Locator 驱动完整会话流程，不需要下载或启动真实浏览器。

## 3. 发布前验证

~~~sh
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

发布使用 npm publish --access public。GitHub 安装还需要 prepare 脚本先生成 lib/。

## 4. 后续路线

1. 在不暴露凭据的前提下增加持久存储状态和登录态管理。
2. 增加选择器快照、下拉选择、键盘输入和多页面会话。
3. 为下载、上传和弹窗增加显式工具权限与文件路径策略。
4. 增加一个真实本地 HTTP fixture 的 Playwright 组合 smoke，覆盖白名单路由和页面交互。
