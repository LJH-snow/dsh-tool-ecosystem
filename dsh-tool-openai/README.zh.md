# dsh-tool-openai

中文 | [English](README.md)

这是一个面向 DeepSeek Harness 的 Cordis 插件，使用官方 OpenAI Responses API 提供受限的文本能力。

## 安装

可从独立仓库或发布后的 npm 包安装：

~~~sh
npm install github:LJH-snow/dsh-tool-openai
# 发布 npm 后：
npm install @libai168/dsh-tool-openai
~~~

宿主 dsh 运行时提供 @deepseek-ai/cordis 和 @deepseek-ai/dsh-tools peer 依赖。

## 配置

~~~yaml
- name: '@libai168/dsh-tool-openai'
  config:
    # 优先使用环境变量或密钥管理器，不要把密钥提交到 YAML。
    apiKey: 'sk-...'
    timeoutMs: 30000
~~~

省略 apiKey 时，插件读取 OPENAI_API_KEY。本 MVP 固定使用官方端点 https://api.openai.com/v1，会拒绝自定义主机、URL 凭据、query、fragment 和非 HTTPS 地址。

## 工具

| 工具 | 行为 |
| --- | --- |
| openai_auth_test | 发起受限的模型列表请求，只返回认证状态和 request ID。 |
| openai_models_list | 最多返回 50 个模型 ID 与所有者。 |
| openai_responses_create | 使用显式模型创建文本响应，始终 store: false，并限制输入与输出长度。 |

MVP 只接受文本，不开放 streaming、图片/音频/文件、远程 URL、代码解释器、联网搜索、函数调用或其他内置工具。工具不会写文件，也不会修改 OpenAI 资源。

## 开发

~~~sh
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
~~~

单元测试注入 transport，不访问真实 OpenAI 服务。客户端会透传取消信号、应用超时、在错误中脱敏凭据，并在工具输出前限制模型与响应数据。

## 发布

发布前先构建并验证：

~~~sh
npm publish --access public
~~~

发布、创建仓库、配置凭据和远程推送不属于本地测试流程。

## 许可证

MIT
