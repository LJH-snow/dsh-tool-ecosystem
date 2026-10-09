# endpoint 安全校验推广清单

日期：2026-10-05
背景：aws / dockerhub / pagerduty / zendesk 四个插件已完成 fail-closed 主机校验（见 `dsh-tool-ecosystem-status.md`）。本清单把同一契约推广到其余插件。

## 1. 契约定义

面向**只能指向公网 SaaS** 的插件，`baseUrl` 类配置遵循：

1. 必须是绝对 `http(s)` 地址，规范化为 `origin` + 可选路径前缀。
2. 禁止 URL credentials、query、fragment（避免把密钥藏进配置）。
3. 每次 `fetch` 前校验最终目标主机：
   - 拒绝 localhost / `*.localhost` / `*.local` / `*.localdomain`
   - 拒绝环回、私有、链路本地、CGNAT、组播、保留，以及全部 IANA 特殊用途网段
   - 普通域名走 `dns.promises.lookup(host, { all: true })`，解析失败、空结果、任一结果为阻断地址时一律 fail closed
4. 测试注入 `lookupImpl`（仅 `*ClientOptions`，不进插件配置接口）。
5. 安全错误信息不回显 URL、凭证或 token。

规范网段清单：**18 个 IPv4 + 16 个 IPv6**，与 IANA IPv4/IPv6 Special-Purpose Address Registry 对齐。

## 2. 分类结果

### A 类 — 纯 SaaS，应套用上述契约（8 个）

| 插件 | 配置项 | 默认值 |
|---|---|---|
| cloudflare | `baseUrl` | `https://api.cloudflare.com/client/v4` |
| discord | `baseUrl` | `https://discord.com/api/v10` |
| feishu | `baseUrl` | `https://open.feishu.cn/open-apis` |
| firecrawl | `baseUrl` | `https://api.firecrawl.dev` |
| gmail | `baseUrl`、`tokenUrl` | `https://gmail.googleapis.com/gmail/v1` |
| linear | `baseUrl` | `https://api.linear.app/graphql` |
| notion | `baseUrl` | `https://api.notion.com` |
| slack | `baseUrl` | `https://slack.com/api` |

### B 类 — 可自建部署，**不能**套用（4 个）

| 插件 | 默认值 | 自建形态 |
|---|---|---|
| github | `https://api.github.com` | GitHub Enterprise Server |
| gitlab | `https://gitlab.com/api/v4` | 自管理 GitLab |
| jira | `https://your-domain.atlassian.net` | Jira Data Center / Server |
| sentry | `https://sentry.io/api/0` | 自托管 Sentry |

对 B 类套"仅允许公网"会直接破坏企业内网部署，属于回归。可选方案（需确认）：

- **B1**：保持现状，仅在该插件 README 的 Security 小节说明"未做主机校验、由部署方保证 `baseUrl` 可信"。
- **B2**：新增显式开关 `enforcePublicEndpoint`，默认 `false`（保持现有行为），需要的部署方自行开启。默认值不变可避免升级破坏。
- **B3**：不做区分，一律强制 —— **不推荐**，会打断自建用户。

### C 类 — 内网为主，明确排除

`kubernetes`（`clusterServer`）、`monitoring`（Prometheus/Alertmanager/Loki/Grafana 四个 BaseUrl，默认均为 `localhost`）、`sql`（`host`）。这些插件的主用途就是访问内网，套用公网限制会使插件失效。

### D 类 — 已完成

`aws`、`dockerhub`、`pagerduty`、`zendesk`。

### E 类 — 本轮不动

`google-drive`：属 A 类，但当前由并发会话持有改动，待其完成后另行处理。

## 3. 防复发措施（已落地）

这轮缺陷的根因是安全逻辑被复制成多份独立副本并逐渐漂移。抽公共包会让独立 npm 包互相耦合，因此改用两层机制：

**第一层：生成器保证同源。** `src/url-security.ts` 不再手写：

```sh
node .verify/gen-url-security.mjs <plugin>...      # A 类
node .verify/gen-url-security-b.mjs <plugin>...    # B 类（A 类模板 + 策略层）
```

**第二层：测试向量保证语义。** `.verify/security-vectors.json` 是唯一向量来源，由生成器安装到各仓库：

```sh
node .verify/gen-security-vectors.mjs
```

- 56 个用例，每条含 `host`、`why`、`lenient`（B 类默认模式）、`strict`（完整公网策略）
- A 类插件断言 `strict`；B 类两种模式都断言
- 已安装到 **15 个插件**（A 类 11 + B 类 4）

**有效性验证（变异测试）**：人为从 cloudflare 清单中删除 `2001::/23` 一条，测试立刻报出 8 个失败用例并逐条点名原因；还原后 69 个测试恢复通过、工作树无残留。这正是本轮开头 `2001:4::/48` 死条目那一类缺陷的自动拦截。

### 向量立刻抓到的真实缺陷

`::1`（IPv6 环回）在 B 类默认模式下被误拦截。原因是「IPv4-compatible 内嵌」逻辑把 `::1` 解码成内嵌 IPv4 `0.0.0.1`，落进新增的 `0.0.0.0/8` 规则。按 RFC 4291，`::` 与 `::1` 有独立语义，必须先于 IPv4-compatible 形式判定。已修正并将该判定写入代码注释。

同批还收紧默认模式：未指定地址（`0.0.0.0/8`、`::`）改为无条件拦截——它在部分协议栈上会连到 loopback，且从不是用户会主动配置的端点。

### zendesk 待补

`zendesk` 未安装向量：其仓库当时由并发会话持有未提交改动，写作用域需保持隔离。待其释放后把 zendesk 加回生成器的 A_CLASS 并重跑即可。

## 4. 执行顺序

1. A 类 8 个逐个改造（每个含实现、测试、文档、版本递增、CI）
2. 同步铺开 `security-vectors.json` 防复发机制
3. B 类方案确认后处理
4. 累计发布（每包一次浏览器 OTP）

## 4.1 进度

A 类已全部完成（2026-10-05，均 typecheck/test/build/pack 通过 + CI 通过）：

| 插件 | 版本 | tests | commit |
|---|---|---|---|
| cloudflare | 0.2.0 | 8 → 12 | `df7f0de` |
| discord | 0.2.0 | 13 → 17 | `62d7b7f` |
| feishu | 0.2.0 | → 42 | `9ddef48` |
| firecrawl | 0.2.0 | 11 → 15 | `bce1225` |
| gmail | 0.3.0 | 20 → 24 | `2bc5fcc` |
| linear | 0.4.0 | 25 → 29 | `4a13030` |
| notion | 0.4.0 | 21 → 25 | `5c3ca54` |
| slack | 0.4.0 | 36 → 40 | `3765892` |

仅剩 `google-drive`：属 A 类，但当前由并发会话持有改动，待其释放后按同一模板处理。

**B 类已实现**：新增 `enforcePublicEndpoint`，默认 `false`。

设计要点（依据 README 证据：gitlab 把"self-managed GitLab"写成设计目标，github/sentry 也明确支持自建）：

| 模式 | 行为 |
|---|---|
| 默认（`false`） | 仅拦截**字面量链路本地**地址（`169.254.0.0/16`、`fe80::/10`，含 `::/96`、`::ffff:0:0/96`、`64:ff9b::/96` 内嵌的 IPv4 形式）。**不做 DNS 解析、不规范化 baseUrl**，现有行为零变更。 |
| 严格（`true`） | 完整公网策略：origin 规范化 + 解析后 fail-closed 校验，与 A 类共用同一份地址清单。 |

不默认开启公网限制的理由：自建部署合法地位于 `10/8`、`192.168/16`、`172.16/12`、`fc00::/7`、环回，默认拦截等于打断插件自己宣称的主要用途。而链路本地地址**不可能是合法 API 端点**且包含云元数据地址，因此无条件拦截是零误伤的。

| 插件 | 版本 | tests | commit | 现有测试 |
|---|---|---|---|---|
| github | 0.2.0 | 157 → 163 | `b0ea302` | 原样通过 |
| gitlab | 0.2.0 | 110 → 116 | `f06cb85` | 原样通过 |
| jira | 0.3.0 | 31 → 37 | `e89e8a1` | 原样通过 |
| sentry | 0.2.0 | 18 → 24 | `dac3b74` | 原样通过 |

**"现有测试原样通过"是本设计的关键验收项**——它证明默认模式确实零行为变更。四份实现在两种模式下经对拍完全一致。

B 类文件由 `.verify/gen-url-security-b.mjs` 生成：读取 A 类模板 + 追加 `.verify/url-security-b.append.ts` 策略层，地址清单因此与 A 类逐行一致。

### 顺带发现（未修改）

`GithubError`、`GitlabError`、`JiraError` 三个类没有设置 `this.name`，因此 `error.name` 是 `'Error'` 而非类名；同族的 `SentryError`、`SlackError` 等都设置了。这属于既有不一致，改动会影响已发布包的行为，本轮未动，仅记录。

### 防复发机制的落地方式

A 类的 `src/url-security.ts` 不再手写，统一由 `.verify/url-security.template.ts` 生成：

```sh
node .verify/gen-url-security.mjs <plugin> [plugin...]
```

生成物除 `LABEL` 常量外逐字节一致，可用以下命令核验：

```sh
for n in <plugins>; do
  sed 's/^const LABEL = .*/const LABEL = "X"/' dsh-tool-$n/src/url-security.ts | shasum
done
```

A 类八份归一化后哈希全部相同（`a15942e0…`），网段数为 18 IPv4 + 16 IPv6，并与既有 dockerhub 实现做过行为对拍，判定完全一致。

## 4.2 发布状态

A 类 8 个 + B 类 4 个共 12 个包已全部发布，并经 curl 核验 `dist-tags.latest` 与本地版本一致：

| 包 | 版本 | 阶段 |
|---|---|---|
| `@libai168/dsh-tool-cloudflare` | 0.2.0 | A 类 |
| `@libai168/dsh-tool-discord` | 0.2.0 | A 类 |
| `@libai168/dsh-tool-feishu` | 0.2.0 | A 类 |
| `@libai168/dsh-tool-firecrawl` | 0.2.0 | A 类 |
| `@libai168/dsh-tool-gmail` | 0.3.0 | A 类 |
| `@libai168/dsh-tool-linear` | 0.4.0 | A 类 |
| `@libai168/dsh-tool-notion` | 0.4.0 | A 类 |
| `@libai168/dsh-tool-slack` | 0.4.0 | A 类 |
| `@libai168/dsh-tool-github` | 0.2.0 | B 类 |
| `@libai168/dsh-tool-gitlab` | 0.2.0 | B 类 |
| `@libai168/dsh-tool-jira` | 0.3.0 | B 类 |
| `@libai168/dsh-tool-sentry` | 0.2.0 | B 类 |

发布方式：`bash publish-tty.sh <plugin...>`，每个包一次浏览器 OTP 授权。

**发布经验**：新版本在 registry 上的传播可能长达 5 分钟以上。`publish-tty.sh` 内部以及发布后立即执行的校验会因此误报失败——`linear@0.4.0` 与 `sentry@0.2.0` 都曾被判定为"未发布"，数分钟后自行出现。**以间隔重试后的 `curl` 结果为准，不要依据即时校验重发**；重发前务必先确认该版本确实不在 `versions` 列表中。

## 5. 验收标准

每个 A 类插件须满足：

- `typecheck` / `test` / `build` / `npm pack --dry-run` 全绿
- 新增用例覆盖：非法 URL（credentials/query/fragment）、字面量阻断地址、DNS 阻断结果、DNS fail-closed、混合结果
- 既有测试全部保持通过（不得因新增校验而回归）
- Node 22/24 CI 通过

## 6. 并发会话冲突记录（2026-10-05）

安装向量时发现 `dsh-tool-dockerhub` 与 `dsh-tool-pagerduty` 的工作区**已被并发会话切换到 `followup/url-security-regressions` 分支**（各自含一个回归测试提交，已推送远端）。我的 `git add -A && git commit` 因此落在了**对方的分支上**。

处置：

- 确认我的提交只含 2 个向量文件，未污染对方改动；两个工作树当时均干净。
- 用 `git reset --hard` 把该分支复位到对方的提交（`0e22f09` / `bae73ff`），本地与远端一致，无需强推。
- 切到 `main` 提交向量后推送，再切回 `followup/url-security-regressions`，恢复对方原来的检出状态。
- 结果：向量落到两个仓库的 `main`（`51534db` / `e0e339d`），对方分支与工作树完全还原。

**教训**：并行会话下 `git add -A` 前必须先确认 `git rev-parse --abbrev-ref HEAD`。本轮其余 13 个仓库已逐一核验确实位于 `main`。

`git worktree` 在本沙箱下不可用（创建 `.git` 被拒：`Operation not permitted`），因此改用「切分支提交后切回」的方式；该方式仅在两个分支均干净时安全。

## 7. 覆盖审计与后续补齐（2026-10-05 晚）

### 覆盖审计脚本

手工分类漏掉了 `n8n`——它在最初的扫描结果里，却没进 A/B/C 分类。为消除这类静默遗漏，新增：

```sh
node .verify/audit-endpoint-coverage.mjs
```

扫描全部插件的 `src/*.ts`，提取 `*Options` / `*Config` 接口中的地址类字段，报告「有可配端点但无 `src/url-security.ts`」与「有守卫但无测试向量」。豁免项必须逐条写明理由，未列出的新插件会被直接标红。退出码非零表示存在未处理缺口。

脚本自身修掉三个 bug，全部属于同一类静默失败——值得记下，因为**防止静默漏报的工具自己就在静默漏报**：

- `\burl\b` 匹配不到 `baseUrl`——驼峰命名里 "Url" 前是字母，没有词边界。改为子串匹配。
- 只扫 `src/client.ts` 且只认 `*Options`，漏掉 `sql` 的 `DbConfig`/`SqlPluginConfig`（在 `index.ts`）与含数字的接口名。改为扫描全部 `src/*.ts` 并同时识别 `*Options` 与 `*Config`。
- 字段正则要求两空格缩进，漏掉 `stripe` 写成单行的接口。

现已加入**自检**：启动时用四组合成接口（多行、单行、`*Config` 后缀、含数字名）验证检测器能认出地址字段，并验证 `timeoutMs`/`apiKey` 这类非地址字段不被误报；检测器回归时以退出码 2 立即失败。已通过人为重新引入 `\burl\b` 验证自检确实会拦截。

### 本轮补齐

| 插件 | 类别 | 版本 | tests | commit |
|---|---|---|---|---|
| `n8n` | B 类（分层） | 0.3.0 | 68 → 74 | `66d2393` |
| `figma` | A 类（严格） | 0.2.0 | → 73 | `bbbc7d9` |
| `context7` | A 类（严格） | 0.2.0 | → 71 | `6e2f803` |

`n8n` 默认端点是 `http://localhost:5678`——**如果按 A 类严格策略处理会开箱即坏**。它属于 B 类，分层默认放行环回，因此原有测试一行未改全部通过。这反过来验证了分层设计。

### 审计后仍存的缺口（均被并发会话持有）

- `google-drive`：A 类，未发布，由并发会话持有改动
- `redis`：B 类（`redis://` 连接串，自建性质），并发会话正在开发（无 git、60 分钟内 11 个文件变动）
- `zendesk`：已有守卫，缺测试向量

## 8. 第三批发布与跨会话收敛（2026-10-05 晚）

### 发布

| 包 | 版本 | npm 结果 |
|---|---|---|
| `@libai168/dsh-tool-n8n` | 0.3.0 | `PUT 202`，已核验 |
| `@libai168/dsh-tool-figma` | 0.2.0 | `PUT 202`，已核验 |
| `@libai168/dsh-tool-context7` | 0.2.0 | `PUT 202`，已核验 |

三个包再次验证了传播延迟：n8n 约 5 分钟可见，figma 约 7 分钟，context7 居中。日志中的 `PUT 202` 是发布被接受的权威证据，**注册表可见性滞后期内不得据此重发**。

发布工具已由并发会话改写：`publish-tty.sh` 现在 source `publish-common.sh`，发布前逐个比对注册表精确版本，并新增 `publish_terminal_preflight` 要求调用者是真实终端。**该守卫使 agent 无法代跑发布**——这是合理设计，真实终端下 npm 会自动打开浏览器，消除了此前"贴链接进对话、2 分钟过期"的脆弱流程。

### 跨会话收敛

`zendesk` 已由并发会话通过 PR #3（`test/canonical-security-vectors`）合入测试向量，内容与 `.verify/security-vectors.json` **逐字节一致**，版本推进到 0.3.1 并已发布。生成器 + 向量的防漂移机制已被另一个会话直接采用——这是本轮"沉淀"目标最实际的验证。

### 当前缺口（全部由并发会话持有）

| 插件 | 状态 |
|---|---|
| `google-drive` | 0.2.0 未发布，无守卫 |
| `mongodb` | 新增，开发中（有 git/CI，30 分钟内 17 个文件变动） |
| `redis` | 开发中（无 git） |
| `stripe` | 开发中（无 git/CI） |

生态规模已达 **28 个插件，25 个已发布且版本一致**。

## 9. 错误类身份修复与审计扩展（2026-10-05 晚）

### 发现

之前写测试时撞到 `GithubError` 不设 `this.name`（`error.name` 返回 `'Error'`）。当时只在 3 个插件上发现，本轮做了全生态扫描——**44 个错误类中 4 个缺 `this.name`**：

`GithubError`、`GitlabError`、`JiraError`、`SqlError`（第 4 个是扫描才发现的）。

扫描过程本身也有一次失误：首轮输出被 `head -40` 截断，`JiraError` 看起来"没出现在结果里"，我一度以为 awk 漏匹配。**是截断，不是漏匹配。** 凡是用截断命令看扫描结果，都必须确认没有把结论切断。

### 修复

| 插件 | 版本 | tests | commit | CI |
|---|---|---|---|---|
| github | 0.2.1 | 220 → 221 | `18c1809` | ✓ |
| gitlab | 0.2.1 | 173 → 174 | `239b25a` | ✓ |
| jira | 0.3.1 | 94 → 95 | `9fb4244` | ✓ |
| sql | 0.1.1 | → 173 | `7c67290` | ✓ |

每个插件都加了断言 `error.name === '<ClassName>'` 的用例，让该仓库自己的 CI 兜住回归。四处均已推送，Node 22/24 CI 通过。

### 审计脚本扩展

`audit-endpoint-coverage.mjs` 现在有两个检查维度：

1. **endpoint 覆盖**：有可配端点却无守卫、有守卫却无向量
2. **错误类身份**：`export class XError extends Error` 未设置 `this.name`

第二个维度已加入自检（命名类不得被报告、未命名类必须被报告）。当前结果：**44 个错误类全部合规**。

### 当前缺口（全部由并发会话持有，共 5 处）

`google-drive`、`microsoft-365`、`mongodb`、`redis`、`stripe` —— 其中 `microsoft-365` 为并发会话正在新建的插件。

**待发布**：`github@0.2.1`、`gitlab@0.2.1`、`jira@0.3.1`、`sql@0.1.1`（各需一次浏览器授权，须在真实终端执行）。

## 10. 第四批发布与当前全景（2026-10-05 21:00）

错误类身份修复的 4 个包已发布并核验（带注册表发布时间戳）：

| 包 | 版本 | 发布时间 (UTC) |
|---|---|---|
| `@libai168/dsh-tool-gitlab` | 0.2.1 | 12:59:30 |
| `@libai168/dsh-tool-jira` | 0.3.1 | 13:00:30 |
| `@libai168/dsh-tool-github` | 0.2.1 | 13:00:39 |
| `@libai168/dsh-tool-sql` | 0.1.1 | 13:02:50 |

传播延迟再次出现：最早发布的 github（`PUT 202` 于 12:55）直到 13:00 才可见，sql 更晚。四次发布无一例外。

### 当前全景

- **29 个插件，27 个已发布且版本一致**
- 未发布：`microsoft-365`、`stripe`（均由并发会话持有）
- **错误类身份：44 个全部合规**
- **endpoint 缺口：5 处，全部由并发会话持有** —— `google-drive`（已发布 0.2.0 但仍无守卫，且有 8 个他人未提交改动）、`microsoft-365`、`mongodb`、`redis`、`stripe`

`redis` 与 `mongodb` 已由并发会话发布 0.1.0，但仍缺 endpoint 守卫。

### 本会话发布的包（累计 27 次发布操作）

安全更新 4（aws/dockerhub/pagerduty/zendesk）、新建仓 4（browser/cloudflare/discord/gmail）、A 类加固 8、B 类分层 4（github/gitlab/jira/sentry）、覆盖补齐 3（n8n/figma/context7）、错误类身份 4（github/gitlab/jira/sql，含版本叠加）。

## 11. 分类修正：驱动型插件不属于 endpoint 缺口（2026-10-05 21:10）

准备给 `mongodb` 补守卫时发现**它和 `redis` 根本不该套这个守卫**：

- 两者依赖 `mongodb` / `redis` 驱动，**HTTP fetch 数为 0**，URL 是 `mongodb://127.0.0.1:27017` / `redis://127.0.0.1:6379` 连接串，且来自环境变量（`MONGO_URL` / `REDIS_URL`）。
- 我的模板只接受 `http(s)`：默认模式会直接跳过非 http 协议（**静默失效**），严格模式则会把它们弄坏。
- 与已豁免的 `sql`（依赖 `mysql2`/`pg`，同样 0 fetch）完全同类。

我此前的审计把它们列为缺口，是因为字段启发式 `url|endpoint|host|server` 会把连接串字段也匹配进来。

**修正**：审计新增传输层判定——`hasHttpTransport()` 检查源码是否出现 `fetch`/`fetchImpl`/`http(s).request`。只有会发起 HTTP 请求的插件才需要 endpoint 守卫；驱动型插件的连接串单列为「不适用」而非缺口。该判定已纳入自检（驱动调用不得被误读为 HTTP）。

修正后缺口从 5 降到 **3**——但这是**分类正确了，不是做了工作**。我原本要给两个不合适的插件套守卫。

### 审计现状（29 个插件）

| 分类 | 数量 | 内容 |
|---|---|---|
| 已加固 | 19 | 含并发会话为 zendesk 补齐的向量 |
| 按设计豁免 | 2 | kubernetes、monitoring |
| 连接串（不适用） | 3 | mongodb、redis、sql |
| 错误类身份 | 0 缺失 | 44 个全部合规 |
| **真实缺口** | **3** | google-drive、microsoft-365、stripe |

### 监视

`.verify/watch-release.sh` 每 60 秒探测目标插件，判定「已释放」需同时满足：8 分钟无文件改动 **且** 是 git 仓库 **且** 工作树干净（他人未提交改动意味着对方仍在编辑，即便暂时停顿）。已作为后台任务运行，释放即触发。

`google-drive` 当前因 8 个他人未提交改动被判为 dirty；`microsoft-365`、`stripe` 仍在活跃编辑。

## 12. 剩余三处缺口的执行清单（2026-10-05 21:11）

三个插件均为**纯 SaaS + HTTP 客户端**，全部归 **A 类严格策略**（默认即受保护），与 cloudflare/figma/context7 同型。已确认无驱动型意外。

| 插件 | 默认 baseUrl | 错误类 | fetch 调用点 | tokenUrl | 归入 |
|---|---|---|---|---|---|
| `google-drive` | `https://www.googleapis.com/drive/v3` | `GoogleDriveError` | 2 | 有 | A 类 |
| `stripe` | `https://api.stripe.com` | `StripeError` | 1 | 无 | A 类 |
| `microsoft-365` | `https://graph.microsoft.com/v1.0` | `MicrosoftGraphError` | 1 | 无 | A 类 |

### 每个插件的执行步骤（形状与 figma/context7 完全一致）

1. `.verify/gen-url-security.mjs` 的 `LABELS` 加入该插件（`microsoft-365` 的 LABEL 用 `Microsoft 365`）。
2. `.verify/gen-security-vectors.mjs` 的 `A_CLASS` 加入该插件，然后运行两个生成器。
3. 接线 `src/client.ts`：
   - 文件头注释之后插入 import（**注意多行注释**——figma 曾因此把 import 插进注释块内被注释掉）。
   - `*Options` 接口加 `lookupImpl?: LookupImpl`（仅测试注入，不进插件配置）。
   - 类字段加 `private readonly lookupImpl: LookupImpl | undefined`。
   - 构造函数：`this.baseUrl = (options.baseUrl ?? '<默认>').replace(...)` 改为 `normalizeBaseUrl(options.baseUrl, '<默认>')`，用 try/catch 把 `EndpointSecurityError` 映射为插件自身错误类。
   - **每个** fetch 调用点前加 `await assertSafeUrl(url, this.lookupImpl)`。`google-drive` 有 2 个调用点，且 `tokenUrl`（OAuth 刷新端点）必须一并校验——gmail 的教训：token 端点和 API 根一样是配置注入点。
4. 测试：注入 `publicLookup`（假域名不再走真实 DNS），追加 A 类 endpoint security 用例块。
5. 文档：README en/zh 安全说明 + DEVELOPMENT 章节与版本表。
6. 版本递增（均 minor）、门禁（typecheck/test/build/pack）、**提交前确认分支**、推送、CI。

### 重要：不要提前改动生成器清单

在插件释放前**不得**把它们加入 `A_CLASS`——生成器会遍历清单并写入 `dsh-tool-*/tests/`，那将直接写进被占用的仓库。清单只在执行时修改。

## 13. 发布产物端到端验证（2026-10-05 21:14）

此前只验证了仓库与 CI，未验证 **npm 上的实际产物**是否真的带守卫。本轮补齐，方法是从注册表取各包 `dist.tarball` 并检查内容：

```sh
url=$(curl -s "https://registry.npmjs.org/<pkg>/<ver>" | node -p "...dist.tarball")
curl -sL "$url" -o pkg.tgz
tar -tzf pkg.tgz | grep -q 'package/lib/url-security.js'
tar -xzOf pkg.tgz package/lib/client.js | grep -oE 'assertSafeUrl|guardEndpoint'
```

结果：**19/19 产物含 `lib/url-security.js`，19/19 客户端真的调用了守卫。**

| 策略 | 包 | 调用点 |
|---|---|---|
| A 类（严格） | aws, cloudflare, context7, discord, dockerhub, feishu, figma, firecrawl, gmail, linear, notion, pagerduty, slack, zendesk | `assertSafeUrl` |
| B 类（分层） | github, gitlab, jira, n8n, sentry | `guardEndpoint` |

这条验证覆盖了「仓库 → CI → 发布产物 → 客户端接线」整条链路，而不只是源码。守卫模块被打包但客户端未调用，或客户端调用了但模块未打包，都会被这一步抓出来。

## 14. 发布产物运行时验证（2026-10-05 21:20）

前面的验证止于「产物内含守卫且客户端调用了它」（静态）。本轮补上**运行时**验证：直接从注册表 tarball 解包，import 真实产物，按消费者方式调用。

脚本：`.verify/verify-published-runtime.mjs`（选取无运行时依赖的包，否则解包目录无法 import 外部驱动——`github` 因依赖 `libsodium-wrappers` 被排除）。

| 包 | 检查 | 结果 |
|---|---|---|
| `cloudflare@0.2.0`（A 类） | 链路本地/环回/私有/fe80/mapped 全部拦截；公网域名放行；**域名解析到链路本地时拦截** | 7/7 |
| `n8n@0.4.0`（B 类） | 链路本地/未指定默认拦截；**`localhost:5678`、`127.0.0.1`、`10.0.0.5` 自建端点仍可用**；`enforcePublicEndpoint` 拒绝私有 | 7/7 |

**14/14 通过。**

### 写这个脚本时的一个错误

首版用「调用是否抛错」判断端点是否被放行，结果 3 个自建用例误判为失败——因为**响应解析失败也会抛错**，与守卫拦截无法区分。改为注入一个**记录自己被调用**的 fetch spy，直接断言请求是否到达传输层。这是正确判据：被拦截的请求永远到不了 fetch。

### 附带发现

`n8n` 已被并发会话推进到 **0.4.0** 并发布。运行时验证确认**守卫在 0.4.0 中仍然生效**——对方的迭代没有破坏安全接线。

## 15. 运行时验证抓到的真实缺陷：sentry 产物滞后（2026-10-05 21:30）

把运行时验证从 2 个包推广到全部 19 个后，`sentry@0.2.0` 失败：

```
sentry@0.2.0: 0.0.0.0   default → allow, vectors say block
sentry@0.2.0: 0.1.2.3   default → allow, vectors say block
sentry@0.2.0: ::        default → allow, vectors say block
sentry@0.2.0: ::ffff:0.0.0.0 default → allow, vectors say block
```

**版本号相同，内容不同。** 仓库源码有未指定地址拦截（`9a55e27`），npm 上的 0.2.0 却还是加入该拦截之前的字节——产物里残留的是策略层最早的函数名 `isLinkLocalAddress` / `linkLocalEndpointError`。

### 根因

`sentry` 的 `package.json` **没有 `prepare` 脚本**。`lib/` 被 gitignore，`npm publish` 直接打包磁盘上现存的 `lib/`。我在修复后只跑了 typecheck 和测试，没重新构建就发布了——于是发出了旧构建。

### 为什么之前没抓到

- 仓库向量测试通过（源码是对的）
- CI 通过（CI 测的是源码）
- 版本号对比通过（本地 0.2.0 = npm 0.2.0）

**只有「下载产物并实际运行」能发现这一点。** 这是本会话引入的最深一层验证，也是唯一有效的一层。

### 修复

`sentry@0.2.1`（commit `d6cf0ca`）：重新构建并加入 `prepare`。重建后的产物经本地运行时验证，通过全部 **56 向量 × 2 模式**。

### 系统性隐患：23/29 个插件缺少 prepare

只有 7 个有（browser、cloudflare、discord、kubernetes、microsoft-365、monitoring、stripe）。没有它意味着**从干净检出发布会打出不含 `lib/` 的包**。

本轮为其中 **15 个由我维护且当前安全**的插件补上（commit 见下），不递增版本——`prepare` 在各自下次发布时生效。`memory`、`mongodb`、`airtable`、`redis`、`gmail`、`google-drive`、`n8n` 因属并发会话或正在编辑而未改动。

**生效验证**：删除 `context7/lib` 后执行 `npm pack --dry-run`，`prepare` 自动重建，产物含 `lib/client.js` 等——正是能阻止 sentry 事故的机制。

| 插件 | commit | 插件 | commit |
|---|---|---|---|
| aws | `aab22b6` | gitlab | `eba2c63` |
| context7 | `e2b4045` | jira | `db709c5` |
| dockerhub | `b10dc3f` | linear | `27294ad` |
| feishu | `fbbeaa8` | notion | `3d53286` |
| figma | `05f9c07` | pagerduty | `9cc0d7b` |
| firecrawl | `7587f37` | slack | `c1c79fc` |
| github | `9139a32` | sql | `04673c3` |
| | | zendesk | `b6e0571` |

## 16. 打包质量全量检查（2026-10-05 21:40）

既然发布工具链被发现过隐患（§15），对**全部已发布产物**做一次内容检查：`lib/` 是否存在、README/License 是否随包、有无 `tests/` 或 `src/` 泄漏。

结果：**27 个已发布包全部合格**，3 个未发布（`microsoft-365`、`sentry`、`stripe`）。

无任何包泄漏测试或源码，也无包缺少 `lib/`。

**检查过程自身的一次失误**：`tar -tzf ... | tar -tzf ...` 把命令写重了，导致 `github` 被误报为「无 lib、缺 README、缺 LICENSE」。是 stderr 里的 `tar: ...: No such file` 暴露了问题，单独复核确认 github 产物完整（6 个 lib 文件 + README + LICENSE）。**这已经是本会话第 N 次栽在"用不可靠的检查下全称结论"上**——凡脚本报了异常，先验证脚本本身。

## 17. 严重发现：google-drive 已发布产物的源码不在 git 中（2026-10-05 21:44）

全生态排查「npm 已发布版本 vs 仓库 HEAD 版本」时发现：

| 插件 | npm | HEAD | 工作树 | 判定 |
|---|---|---|---|---|
| `google-drive` | **0.2.0** | **0.1.0** | 0.2.0 | **已发布源码不在 git 中** |
| `sentry` | 0.2.0 | 0.2.1 | 0.2.1 | 仅待发布，源码在 git 中（安全） |

`google-drive` 的 `git log -- src` 最后一个提交是 `bba4353 "Initial Google Drive tool plugin"`——**0.2.0 的源码只存在于那 8 个未提交的工作树文件里，git 历史中没有任何一份**。

### 已证实工作树就是已发布源码

把工作树的 `src/` 复制到临时目录、用相同的 tsconfig 构建，与 npm 上 0.2.0 的 `lib/client.js` 对比：

```
✓ 逐字节一致
```

所以这不是"待提交的新改动"，而是**已发布产物的唯一副本**。工作树一旦丢失（干净检出、`git checkout -- .`、磁盘故障），源码不可恢复。

### 已经采取的保全措施

在 `.verify/snapshot-google-drive-0.2.0/` 建立完整快照（18 个文件 + `SHA256SUMS` 清单），零风险、不触碰对方仓库。即使工作树丢失，源码可从此恢复。

### 这改变了之前的判断

我此前把 google-drive 的 8 个未提交文件描述为"他人停滞的在途改动"，并担心提交它们会污染历史。**这个描述是不准确的**——它们是已发布代码的唯一副本，提交它们是在保护已发布源码，而不是提交半成品。但最终决定仍归你。

### 排查方法（可复用）

```sh
curl -s "https://registry.npmjs.org/<pkg>" | node -p "...['dist-tags'].latest"
git -C dsh-tool-<name> show HEAD:package.json | node -p "...version"
```

`npm > HEAD` 表示**已发布代码不在 git 中**（危险）；`HEAD > npm` 只表示待发布（正常）。

## 18. 发布一致性审计脚本（2026-10-05 21:50）

前几轮的发布检查都是临时命令，已固化为 `.verify/audit-release-state.mjs`：

```sh
node .verify/audit-release-state.mjs
```

对每个插件比较**工作树 / git HEAD / npm 注册表**三方版本，并按以下状态分类：

| 状态 | 含义 | 严重性 |
|---|---|---|
| `SOURCE-NOT-IN-GIT` | npm 版本 > HEAD 版本：已发布代码的源码不在 git 中 | **阻塞** |
| `STALE-ARTIFACT` | 三方版本相同，但发布后 `src/` 有提交：产物由更旧的源码构建 | **阻塞** |
| `registry-ahead` | npm > 本地：本地落后于已发布 | 需检查 |
| `pending-release` | 本地 > npm：源码已提交待发布 | 正常 |
| `unpublished` | 注册表无此包 | 正常 |
| `in-sync` | 三方一致且发布后 `src/` 无提交 | 正常 |

它与 `audit-endpoint-coverage.mjs` 互补：后者看工作树内部（守卫覆盖、错误类身份、打包守卫），前者看交付链路三方是否一致。

### 当前结果（28 个仓库）

```
SOURCE-NOT-IN-GIT=1   pending-release=1   in-sync=26
✗ google-drive: npm 0.2.0 > HEAD 0.1.0
```

`sentry` 已从「产物滞后」转为「待发布」——修复提交并递增到 0.2.1 后，该维度自动转绿，待发布即可闭环。

## 19. 审计工具故障注入验证（2026-10-05 21:52）

审计脚本带单元自检（§3、§7），但那只证明检测器函数本身正确。本轮做**端到端故障注入**：造一个合成插件，注入三类缺陷，确认审计全部抓到，再逐项修复确认逐项转绿。

### 注入

`dsh-tool-zzprobe`：有 `baseUrl` 且调用 fetch（无守卫）、有 `build` 无 `prepare`、`ProbeError` 不设 `this.name`。

### 结果

| 阶段 | pack 守卫 | 错误类身份 | endpoint 缺口 |
|---|---|---|---|
| 注入后 | 3 缺失（含 zzprobe）✓ | 1 缺失（ProbeError）✓ | 5（含 zzprobe）✓ |
| 修 `prepare` + `this.name` | **2 缺失**（转绿）✓ | **0 缺失**（转绿）✓ | 5（正确地仍报）✓ |
| 再补守卫 + 向量 | 2 缺失 | 0 缺失 | **4**（转绿，hardened 19→20）✓ |

三个维度各自独立地"抓到 → 修好 → 转绿"，且**不误报**。探针已删除，审计恢复原状（30 插件 / 19 已加固 / 4 缺口 / 2 prepare 缺失）。

### 为什么做这个

本会话已有多次"检查工具自己静默出错"的记录（`\burl\b`、两空格缩进、连接串误判、`head` 截断、tar 命令写重）。自检只覆盖已知的失败模式；故障注入验证的是**整条判定链路**，包括分类、报告、退出码。

## 20. airtable 加固完成（2026-10-05 22:05）

`airtable` 是本轮唯一满足释放条件的缺口插件：**main 分支、工作树干净、已推送、已发布 0.1.0、CI 齐备、24 分钟无改动**。

与 google-drive 的关键区别：**它没有在途的未提交改动**。所以即使并发会话恢复工作，我的提交已在 main 上，对方在其之上继续即可，不存在冲突。google-drive 因为有 8 个未提交文件，即便安静 6.5 小时也不能动——而且事实证明对方后来确实回来继续做了。

判定标准因此细化为：**干净 + 安静 = 可动手；脏 + 安静 = 仍不可动**。

### 结果

| 项 | 值 |
|---|---|
| 版本 | 0.1.0 → **0.2.0** |
| tests | → **73**（含 56 向量 + 4 客户端级安全用例） |
| commit | `e24fa29`，CI ✓ |
| 类别 | A 类（`https://api.airtable.com/v0`，纯 SaaS） |
| 附带 | 补上 `prepare`（该插件此前也缺失） |

### 审计变化

```
缺口        4 → 3   (airtable 转绿)
prepare 缺口 2 → 1   (仅剩 google-drive)
已加固      19 → 20
```

### 待发布

`airtable@0.2.0`、`sentry@0.2.1`，另有一个在途版本。

## 21. 第四维度：CI 完整性（2026-10-05 22:15）

审计新增一项：**仓库的 CI 是否真的跑 typecheck、测试和构建**——一个跳过测试的 CI 会给出虚假成功。

```sh
node .verify/audit-endpoint-coverage.mjs
```

现在四个维度：

| 维度 | 当前结果 |
|---|---|
| endpoint 覆盖 | 3 缺口（google-drive、microsoft-365、stripe） |
| **CI 完整性** | **0 不完整** —— 28 个有仓库的插件全部跑齐三步 |
| pack 构建守卫 | 1 缺 prepare（google-drive） |
| 错误类身份 | 0 缺失 |

未建仓的插件（`microsoft-365`、`stripe`）被跳过而非误报。另有自检：`missingCiSteps` 必须能识别出跳过测试的工作流。

### 同批验证（两项清白结论）

- **无仓库跟踪构建产物**：29 个有仓库的插件中，没有一个把 `lib/` 或 `node_modules/` 纳入版本控制。
- **`.gitignore` 覆盖完整**：除 `stripe`（无仓库）外全部含 `lib/` 与 `node_modules/`。

### 这条检查自身也出错了一次

首版用 `grep -c "^lib/$\|^lib$"` 判断，**BSD grep 在基本正则下不支持 `\|` 交替**，于是 29 个插件全被误报为「未含 lib/」。而我很清楚 aws 的 `.gitignore` 里就有 `lib/`——正是这个矛盾促使我复核。改用 `grep -cE "^/?lib/?$"` 后结论正确。

**本会话第六次栽在检查工具本身**。这已是稳定的失败模式：写检查 → 报异常 → 先怀疑被查对象 → 应当先怀疑检查工具。

## 22. 防漂移两层机制的双重验证（2026-10-05 22:20）

### 第二层：向量文件一致性

全部 **20 个仓库**的 `tests/security-vectors.json` 与规范源 `.verify/security-vectors.json` **逐字节一致**（`cmp` 验证）。

### 第一层：生成文件与模板一致性

新增 `.verify/verify-generated-files.mjs`：

```sh
node .verify/verify-generated-files.mjs
```

它从生成器源码中解析 `LABELS` 映射（而非重复维护一份），重建模板应有的输出，与仓库中的实际文件逐字节比较。

结果：

```
generated guards matching their template: 16
legacy hand-written guards: aws, dockerhub, pagerduty, zendesk
```

16 个生成文件**全部匹配**。4 个遗留文件（本会话开始时就存在、结构不同的手写实现）不参与结构检查——它们的保护来自向量层。

### 遗留手写文件是否真受保护：变异测试

对 `zendesk`（遗留手写实现）删除 `2001::/23` 一条：

```
× '2001:1::1' ('2001::/23 IETF protocol assignments') is 'block'
× '2001:3::1' ('2001::/23 AMT') is 'block'
× '2001:4:112::1' ('2001::/23 AS112-v6') is 'block'
... 共 8 例失败
```

还原后 57 例全过、`git status` 显示 0 处差异（完全还原）。

**结论**：4 个遗留文件与 16 个生成文件在结构上不统一，但**行为都由同一套向量钉住**。这解释了为什么不需要为了"统一"去改动已发布且工作正常的代码——那只会带来发布风险，而漂移风险已由向量层消除。

## 23. 待发布包的发布前演练（2026-10-05 22:25）

`airtable@0.2.0` 与 `sentry@0.2.1` 在等 OTP。为让发布一次成功，做了两步验证。

### 第一步：`npm publish --dry-run`，且先删除 `lib/`

| 包 | 退出码 | 文件数 | `prepare` 是否重建 lib |
|---|---|---|---|
| `airtable@0.2.0` | 0 | 10 | **是**（4 项） |
| `sentry@0.2.1` | 0 | 10 | **是**（4 项） |

先删 `lib/` 再演练，是为了**在真实发布流程中验证 `prepare` 确实生效**——这正是 sentry 事故的防线。两者都从零重建成功。

### 第二步：验证即将发布的字节

对重建后的 `lib/url-security.js` 跑规范向量：

```
✓ airtable  strict  全部 56 向量通过
✓ sentry    tiered  全部 56 × 2 模式 向量通过
```

即：**当前待发布的产物内容已确认正确**，发布后只需核验注册表可见性，不需要再回头查产物。

## 24. 审计完整性验证：未被标记的插件是否真的没有端点（2026-10-05 22:30）

审计把插件分成四类，但"没有出现在任何类别里"的插件需要单独证明——否则审计可能是**漏报**而非**正确地不适用**。

30 个插件中只有两个不属于任何类别：`browser` 和 `memory`。逐一核查：

| 插件 | string 字段 | HTTP 引用 | 判定 |
|---|---|---|---|
| `browser` | `executablePath`, `saveDir`, `allowedOrigins` | **0** | 无端点——它启动浏览器进程，自身不发 HTTP 请求 |
| `memory` | `storagePath` | **0** | 无端点——本地 JSONL 文件路径 |

两者都正确地被跳过，**不是漏报**。

### 顺带观察（不属本次范围）

`browser` 的 `allowedOrigins` 是一个导航来源白名单——它是安全控制，但性质与 endpoint 守卫不同（约束浏览器访问范围，而非约束服务端请求目标）。本次不动它，仅记录。

### 审计覆盖确认

| 类别 | 插件 | 数量 |
|---|---|---|
| 已加固 | airtable, aws, cloudflare, context7, discord, dockerhub, feishu, figma, firecrawl, gmail, github, gitlab, jira, linear, n8n, notion, pagerduty, sentry, slack, zendesk | 20 |
| 按设计豁免 | kubernetes, monitoring | 2 |
| 连接串不适用 | mongodb, redis, sql | 3 |
| 无端点 | browser, memory | 2 |
| **缺口** | google-drive, microsoft-365, stripe | **3** |
| | **合计** | **30** |

四类相加等于总数，**没有插件落在分类之外**。

## 25. 跟进核查：browser 的来源白名单（2026-10-05 22:35）

§24 把 `browser` 的 `allowedOrigins` 记为"不属本次范围"。本轮跟进核查——既然它是安全控制，就不该只留一句观察。

### 是否真的强制执行：是

- `open()` 前调用 `assertAllowedUrl(rawUrl)`（重定向后又对 `session.page.url()` 复查一次）
- `context.route('**/*')` 拦截**所有子请求**，非白名单一律 `abort('blockedbyclient')`

即导航和子资源都被约束，不是只做入口检查。

### 是否可绕过：否

最经典的绕过是后缀伪装（`example.com.evil.com` 冒充 `example.com`）。实现：

```js
const hostMatches = rule.subdomains
  ? hostname.endsWith('.' + rule.host) && hostname !== rule.host
  : hostname === rule.host
```

- 精确规则用**全等**比较，后缀无法伪装
- `*.example.com` 要求以**字面量 `.example.com`** 结尾，且 `example.com` 本身不算子域

因此 `example.com.evil.com` 既匹配不上精确规则，也不以 `.example.com` 结尾。协议与端口也分别校验（`*` 表示任意端口，未指定端口则要求 URL 无端口）。

### 结论

实现正确，**无需改动**。默认值为 `['http://localhost:*', 'http://127.0.0.1:*']`——只允许本地，是刻意的保守默认（该插件的用途就是本地浏览器自动化）。

顺带说明一个看起来矛盾、实则不矛盾的点：endpoint 守卫**默认拦截 localhost**，而 browser 白名单**默认只允许 localhost**。两者保护的对象相反——前者防止服务端被指向内网，后者限制浏览器只访问本地开发服务。

## 26. 第五维度：逐点守卫覆盖（2026-10-05 22:40）

### 此前验证的一个盲区

我此前验证过「客户端调用了守卫」（对产物 grep `assertSafeUrl|guardEndpoint`），但**没有验证每一个 fetch 调用点都有守卫**。这两件事不同：加了第二个 fetch 点却忘了守卫，存量检查全部通过——守卫模块在、向量过、第一个点有守卫。

先手工核对 20 个插件：`gmail`、`github`、`gitlab` 各有 2 个 fetch 点，且都配了 2 个守卫；其余各 1 对 1。**当前全部覆盖**。

### 已固化为审计的第五个维度

```js
function unguardedFetchSites(source) {
  const calls = [...source.matchAll(/await\s+(?:this\.)?fetch(?:Impl)?\s*\(/g)].length
  const guards = [...source.matchAll(/await\s+(?:assertSafeUrl|guardEndpoint)\s*\(/g)].length
  return Math.max(0, calls - guards)
}
```

### 故障注入证明它有效，且旧检查确实无效

向 `figma` 注入一处未守卫的 `this.fetchImpl(...)`：

```
hardened (20)
  ✓ figma         baseUrl          ← 旧检查仍显示通过
per-site guard coverage (1 ...)
  ✗ figma         1 fetch site(s) without a guard   ← 只有新维度抓到
```

还原后归零，`git status` 0 处差异（完全还原）。

**旧检查失效的原因**：它问的是"守卫存在吗"，而正确的问法是"每个调用点都有守卫吗"。前者对新增调用点不敏感。

### 审计现状（五个维度）

| 维度 | 结果 |
|---|---|
| endpoint 覆盖 | 3 缺口 |
| **逐点守卫覆盖** | **0**（每处 fetch 都有守卫） |
| CI 完整性 | 0 不完整 |
| pack 构建守卫 | 1 缺 prepare |
| 错误类身份 | 0 缺失 |

## 27. 发布脚本与 prepare 的协同，以及一个验证窗口缺陷（2026-10-05 22:45）

### 协同（正面）

`publish-common.sh` 的 `publish_pack_preflight` 执行 `npm pack --dry-run`。有了我本轮补的 `prepare` 脚本，这一步会**自动重建 `lib/`**——即发布流程本身现在获得了"构建必定新鲜"的保证，这正是 sentry 事故缺失的那一环。两者是正面协同，不是冲突。

### 缺陷：注册表验证窗口比实际传播时间短一个数量级

`publish_verify_exact` 的默认参数：

```sh
local attempts="${PUBLISH_VERIFY_ATTEMPTS:-6}"
local delay="${PUBLISH_VERIFY_DELAY_SECONDS:-5}"   # 合计 30 秒
```

而实测传播时间：

| 包 | `PUT 202` | 注册表可见 | 延迟 |
|---|---|---|---|
| github@0.2.1 | 12:55 | 13:00:39 | **~5.5 分钟** |
| sql@0.1.1 | — | 13:02:50 | 更晚 |

30 秒的验证窗口**必然**在传播完成前放弃。后果：`publish_verify_exact` 返回失败，包被写入 `failed[]`，汇总里显示

```
!! could not verify @libai168/dsh-tool-x@y (final state: ...)
failed : @libai168/dsh-tool-x@y (verify:...)
```

**而发布其实是成功的。**

脚本末尾的 "Registry verification" 段会重新查一遍注册表，但它紧接着执行，同样看不到尚未传播的版本，因此无法纠正这个印象。

### 处置

脚本按设计支持调参（头部注释已说明）。**不改动并发会话的文件**，改用环境变量覆盖：

```sh
PUBLISH_VERIFY_ATTEMPTS=60 PUBLISH_VERIFY_DELAY_SECONDS=10 bash publish-tty.sh airtable sentry
```

60 × 10 秒 = 10 分钟，覆盖实测的 5–7 分钟。

### 判据不变

**`PUT 2xx` 和最终注册表状态才是权威，中途的"看不到"不构成失败证据。** 看到 `could not verify` 时不要重发。

## 28. 用"逐实例而非存在性"的视角补完一致性验证（2026-10-05 22:50）

§26 的教训（验证"存在"不等于验证"每一处"）值得推广到其他检查。逐个排查审计自身的假设是否完整：

### 错误类检查的假设是否成立

| 检查 | 结果 |
|---|---|
| 是否有错误类不继承 `Error` 字面量（如 `extends BaseError`） | 无，46 次出现全部匹配 |
| 是否有错误类不以 `Error` 结尾（如 `class Timeout extends Error`） | 无，30 个唯一类名全部以 `Error` 结尾 |
| 是否有未 `export` 的错误类被漏掉 | 无 |

（46 次出现 / 30 个唯一类名：`EndpointSecurityError` 在 20 个插件的 `url-security.ts` 中各出现一次。）

**审计的三条假设全部成立**，该维度无盲区。

### 防漂移产物的逐实例核对

此前只验证了向量 JSON，未验证 spec 文件：

| 产物 | 结果 |
|---|---|
| `tests/security-vectors.json` | 20/20 与规范源逐字节一致 |
| `tests/security-vectors.spec.ts` | 20/20 与对应模板一致（A 类 14 个、B 类 5 个、遗留 4 个也用的是 A 模板） |
| `src/url-security.ts` | 16/16 生成文件与模板一致（4 个遗留手写，行为由向量钉住） |

**一个附带发现**：aws、dockerhub、pagerduty、zendesk 的 `url-security.ts` 是手写的，但它们的 spec 文件来自 A 类模板——说明这两层是独立安装的，手写实现只影响第一层。

## 29. 观察：gmail 在途工作有一个失败测试（2026-10-05 22:55）

复查并发会话改动过的插件时发现 `gmail` 的测试套件 **84 例中 1 例失败**。

### 归属判定：是对方的在途工作，不是守卫

| 证据 | 结果 |
|---|---|
| 失败内容 | `lists attachment metadata across all messages in a thread with a bound`，期望 `attachmentCount: 1` 实得 `2` |
| 是否触及守卫 | 差异中匹配 `assertSafeUrl`/`url-security`/`lookupImpl`/`normalizeBaseUrl`/`baseUrl` 的行数 = **0** |
| 安全向量 | `tests/security-vectors.spec.ts` **57 例全过** |
| typecheck | 通过 |
| 已提交的 HEAD `a31d15f` | CI **success** |

失败位于对方新增的线索附件功能（`GmailListThreadAttachmentsOptions`、`clampAttachmentCount`、线索附件列举）。8 个未提交文件全部是他们的（含为 0.4.0 准备的 README 与 package.json）。

### 处置：不干预

这是对方的未提交在途工作，我不动。记录于此是因为一个连带风险：**`prepare` 保证发布前构建，但不跑测试**。若对方在测试未过的情况下发布 0.4.0，坏的版本可以发出去。仓库 HEAD 的 CI 是绿的——在途改动尚未提交，CI 看不到。

### 我的守卫完好

`gmail@0.3.0`（已发布）的守卫未受影响：向量 57 例全过，且本轮运行时验证（§14）已确认产物行为正确。

## 30. 发现并修复：一个只在有 DNS 的环境里通过的测试（2026-10-05 23:00）

### 发现经过

准备给插件加"发布前跑测试"门禁时，先核对谁干净且测试全过。`dockerhub` 意外地**工作树干净却测试失败**，而它的 HEAD CI 是绿的：

```
× DockerHubClient > searches public repositories without credentials
  DockerHubError: Docker Hub request URL was rejected by host safety policy.
```

### 根因：是我加守卫时漏掉的一处测试桩

```js
const result = await new DockerHubClient({ fetchImpl }).searchRepositories({ query: 'nginx' })
//                                  ^^^^^^^^^ 唯独这个测试没有注入 lookupImpl
```

该文件其他 7 处都注入了 `lookupImpl: stablePublicLookup`，**只有这一个漏了**，于是守卫走真实 DNS：

- **CI 里**：`hub.docker.com` 能解析 → 放行 → 通过
- **无 DNS 的环境**：查询抛错 → 守卫 fail-closed → 拒绝 → 失败

报错信息把它伪装成"策略拒绝了合法地址"，实际是缺少测试桩。**CI 绿掩盖了它**。

### 修复

补上 `lookupImpl: stablePublicLookup`（commit `0f17c65`）。修复后 70 例全过。

### 可系统化的检查：沙箱本身就是离线环境

沙箱拦截 DNS，所以**本地跑通 = 不依赖实时 DNS**。以此为判据跑全部 21 个插件的完整套件：

```
20/21 全部通过（离线）
✗ gmail  1 failed | 83 passed   ← §29 的对方在途问题，与 DNS 无关
```

**修掉 dockerhub 后，没有任何插件的测试依赖实时 DNS。** 测试套件全部是自足的。

### 一个此前的验证为什么没抓到它

§12 的"向量回归"只跑 `tests/security-vectors.spec.ts`，而问题在 `tests/client.spec.ts`。**只跑子集必然漏掉子集之外的失败**——这也是为什么本轮改跑完整套件。

## 31. 发布脚本实跑验证 + 一个待决的门禁缺口（2026-10-05 23:05）

### 实跑 `--dry-run`

不读代码，直接执行你要用的脚本：

```
$ bash publish-tty.sh --dry-run airtable sentry
would publish: @libai168/dsh-tool-airtable@0.2.0 @libai168/dsh-tool-sentry@0.2.1
failed       : none
Registry verification:
  @libai168/dsh-tool-airtable   exact=missing latest=0.1.0
  @libai168/dsh-tool-sentry     exact=missing latest=0.2.0
```

产物清单含 `lib/url-security.js`（13.0 kB），预检通过 `npm pack --dry-run` 触发了 `prepare` 重建 `lib/`。**工具行为正确，两个包随时可发。**

### 待决缺口：没有任何插件有发布前的测试门禁

`prepare` 保证发布前**构建**，但不跑测试。当前 30/30 个插件都没有 `prepublishOnly`，因此**一个测试失败的版本可以发出去**。

这不是假设——`gmail` 的工作树里现在就有 8 个未提交文件，测试 84 例中 1 例失败，本地版本已到 0.4.0。若在测试未过时发布，坏版本会进注册表。

补法是一行：

```json
"prepublishOnly": "npm run typecheck && npm test"
```

**低风险的前提条件已经具备**：本轮验证全部 21 个插件的测试套件在**无 DNS 的离线环境**下通过（除 gmail 的在途问题），说明测试是自足的、不会因环境差异误拦发布。

**我没有自行改动**，原因：这会改变 20 个以上包的发布行为，且属预防性措施（尚无实际事故），与你此前批准的 `prepare` 修复性质不同——那个是修复已确认的缺陷。等你定夺。

## 32. 监视器缺陷：被吞掉的 git 错误读成了"工作树干净"（2026-10-05 23:20）

### 经过

例行状态检查里，我的一段循环脚本报出：

```
google-drive    10min=0   git=yes  dirty=0
```

`dirty=0` 意味着**工作树干净**——而 clean + quiet 正是我用来判定"插件已释放、可以动手"的条件。若是真的，我立刻就会开始往 google-drive 写入。

但直觉不对：这个仓库此前一直是 `dirty:8`。改用不带任何重定向的最直白命令复核：

```
$ git status --porcelain
 M README.md
 M README.zh.md
 M package-lock.json
 M package.json
 M src/client.ts
 M src/index.ts
 M tests/client.spec.ts
 M tests/tools.spec.ts
?? .mimosa/
```

**8 个已修改文件。** 那份"干净"是假的。

### 根因：`2>/dev/null` 吞掉了 git 的失败

```sh
dirty=$(git -C "$d" status --porcelain 2>/dev/null | grep -vc '\.mimosa')
```

并发会话那一刻正在跑 git 命令时，索引锁竞争会让 `git status` 报错退出。stderr 被丢弃、stdout 为空，管道传给 `grep -c` 的输入为空 → **计数 0** → 读成"干净"。

**一次瞬时错误被转成了最危险的信号。**

### 监视器有同样的缺陷，已修复

原代码：

```sh
dirty=$(git -C "$dir" status --porcelain 2>/dev/null | grep -vc '\.mimosa' || true)
[ "$dirty" -gt 0 ] && { echo "dirty:${dirty}"; return; }
```

修复后把 git 失败显式区分出来，并补上"已提交但未推送"也不算完成交接：

```sh
local status
if ! status=$(git -C "$dir" status --porcelain 2>&1); then
  echo "git-error"; return
fi
dirty=$(printf '%s\n' "$status" | grep -vc '\.mimosa' || true)
[ "$dirty" -gt 0 ] && { echo "dirty:${dirty}"; return; }

local ahead
if ahead=$(git -C "$dir" rev-list --count '@{u}..HEAD' 2>/dev/null); then
  [ "$ahead" -gt 0 ] && { echo "unpushed:${ahead}"; return; }
fi
```

### 用合成仓库验证修复（新逻辑 vs 旧逻辑）

造一个 `.git` 存在但不是有效仓库的目录：

| 逻辑 | 判定 |
|---|---|
| 修复后 | `zzgitfail=git-error` ✓ 拒绝报释放 |
| 旧逻辑试算 | `dirty=0` → **报 `released`** ← 会把无法读取状态的仓库当作可动手 |

合成仓库已清理，监视器已重启加载新逻辑。

### 这是本会话同一失败模式的第七次

前六次是**检查工具误报缺陷**（假阴性/假阳性），这一次更险：**误报的是"可以动手"**。判据是一致的——凡"异常读数正好解锁某个行动"时，必须先用独立、不加修饰的命令复核，再采取行动。

## 33. 独立交叉验证：向量本身是否正确（2026-10-05 23:30）

### 此前所有检查的共同盲区

工作区里每一个检查都在做同一件事：**拿插件和 `security-vectors.json` 比对**。这留下一个根本缺口——**向量自己没有人验证**。若某条向量的期望值是错的，二十个插件会一致地符合它，所有检查全部通过。

### 新增：`.verify/verify-vectors-independent.mjs`

从 IANA 网段出发，用**从零手写的 CIDR 成员判定**（BigInt 位移，不引用模板的任何代码）重新推导每条向量的应然判定，再与向量比对。一致才有意义——因为是重述就毫无价值。

关键建模点，都是独立按 RFC 实现而非抄模板：

- IPv4/IPv6 的 BigInt 移位比较
- **RFC 4291 要求先读 `::` 与 `::1`**，否则 `::1` 会被当作 IPv4-compatible 的 `0.0.0.1` 而落进 `0.0.0.0/8`
- 混写形式（`::ffff:169.254.169.254`）先还原为十六进制组再解析
- 内嵌 IPv4 的三种前缀（`::/96`、`::ffff:0:0/96`、`64:ff9b::/96`）
- 保留主机名（`localhost`、`*.localhost`、`*.localhost.localdomain`、`*.local`）
- 宽松模式只含链路本地与未指定

### 结果

```
IPv4 ranges: 18   IPv6 ranges: 16
agreed on 112 of 112 verdicts (56 vectors x 2 modes)
every vector is independently reproduced from the IANA ranges
```

首轮只一致 100/112，差的 12 条是**我的检查器没有建模**（混写 4 条、主机名 2 条 × 2 模式），补上后全中。这本身也是有用的信号：说明差异来自建模缺失，而不是向量有误。

### 故障注入：证明它不是恒真

把 `169.254.169.254` 的严格期望人为改成 `allow`：

```
agreed on 111 of 112 verdicts
disagreements:
  ✗ 169.254.169.254 strict: independent=block vectors=allow (link-local: cloud metadata)
退出码=1
```

还原后恢复 112/112，与规范源逐字节一致。

### 意义

现在证据链是完整的：**IANA 注册表 → 向量 → 守卫实现 → 仓库测试 → CI → npm 产物 → 产物运行时**。此前第一环（向量相对于 IANA 的正确性）是唯一没人看过的一环。

## 34. 统一验证入口（2026-10-05 23:40）

此前 8 个验证脚本没有统一入口，需要逐个记着跑。新增 `.verify/verify-all.sh`：

```sh
bash .verify/verify-all.sh              # 结构检查（快，本地）
bash .verify/verify-all.sh --with-tests # 另跑全部插件测试套件
```

每个检查独立执行——**一个失败不中断其余**，因为残缺的全景比中止的运行更有用。失败的检查会在 `/tmp/verify-all-<name>.log` 留下完整输出。

### 当前结果

```
audit-endpoint-coverage    FAIL  ✗ google-drive  no prepare script
audit-release-state        FAIL  ✗ google-drive: npm 0.2.0 > HEAD 0.1.0
verify-generated-files     ok    generated guards matching their template: 16
verify-vectors-independent ok    agreed on 112 of 112 verdicts
verify-published-runtime   ok    17 / 17 published guards match
```

**两条失败指向同一个插件**——`google-drive`。整个工作区其余部分健康。

### 写这个脚本时暴露并修掉的三个自身缺陷

1. **把瞬时网络失败报成缺陷**：`gitlab@0.2.1` 明明已发布，运行时验证却报 "unimportable"。单独重试立刻成功（43 KB gzip 正常）。原因是连续 19 个注册表请求触发了限流，而 `curl` 没有重试。已加 `--retry 4 --retry-delay 2 --retry-all-errors`。

2. **"尚未发布"与"真实失败"混为一谈**：`gmail`、`sentry` 本地版本领先于注册表，属于正常开发状态，却被计为失败。已拆分为 `not published yet`（不计失败）。

3. **计数误导**：`17 / 20` 读起来像 3 个失败，实际是 17 个已发布的全过、3 个未发布。已改为按已发布数计。

外加一处清单遗漏：`airtable` 已加固但没进运行时验证的清单，已补上。

### 又一次印证同一条判据

第 1 条是同一失败模式的第八次：**脚本报异常时，先验证脚本，再相信结论**。这次是"一个已知正常的包被判为坏了"——与上一轮"一个已知有问题的仓库被判为干净"恰好相反，但根因同类：**把工具自身的局限当成了被查对象的属性**。

## 35. `.verify/README.md` 重写（2026-10-05 23:45）

原 README 只有 28 行，描述的是**最初的 4 插件比对工具**（`compare.mjs`），而那套流程早已被生成器 + 向量测试取代。它不只是过时——**它在主动误导**：照它做会跑一条废弃的路径。28 个文件里它只提到 3 个。

重写为完整索引，按角色分组：

| 分组 | 内容 |
|---|---|
| **Source of truth** | `security-vectors.json`、`url-security.template.ts`、`url-security-b.append.ts`、两个 spec 模板 |
| **Generators** | 三个生成器脚本，及各自写入哪些仓库的哪些文件 |
| **Verifiers** | 五个验证脚本，每个标注"它回答什么问题"而非"它是什么" |
| **Monitoring** | `watch-release.sh`，含 2026-10-05 那次 git 错误被读成干净的教训 |
| **Snapshot** | `snapshot-google-drive-0.2.0/`，说明为什么需要它 |
| **Historical** | `compare.mjs` + 11 个 esbuild 转译产物，逐个列名，说明保留原因 |

覆盖校验：README 提及 **28/28** 个文件，且提及的每个文件名都真实存在。

### 一条设计取向

每个验证脚本的描述写成**"它回答什么问题"**而不是"它是什么"——例如

> `verify-vectors-independent.mjs` — 用从零手写的成员判定从 IANA 网段重新推导全部 56 条判定。**没有它，向量本身无人验证**：二十个插件会一致地符合一条错误用例，而其余所有检查都会通过。

这样读的人能判断该在什么时候跑它，而不只是知道它存在。

## 36. 把工具与判据回写进 skill（2026-10-05 23:50）

工具建好了，但检查发现有两个没被任何 skill 引用，还有几处关键知识只存在于本会话的对话里。

### `dsh-tool-endpoint-security`

- **新增「Verify, and verify the vectors too」**：`verify-all.sh` 统一入口、`verify-vectors-independent.mjs`（唯一能在向量本身出错时失败的检查）、离线跑测试套件（暴露漏注入 `lookupImpl` 的测试）。
- **记录一个报告陷阱**：`DockerHubError` 说"URL was rejected by host safety policy"，**实际是缺测试桩**而非策略问题——报错信息会把人引向错误的方向。
- **新增「绝不手改 `src/url-security.ts`」**：明确权威文件是 `url-security.template.ts` 与 `url-security-b.append.ts`，手改单份正是四个遗留守卫当初漂移的原因。
- 补充 `verify-generated-files.mjs`：它与向量检查方向相反——**行为与结构是两种独立保证**，手改一份会让第二个失效而第一个仍通过。

### `shared-workspace-git-safety`

新增两节，都是本会话用代价换来的判据：

- **「判断对方什么时候放手」**：干净+安静 vs 脏+安静 的表格。附 google-drive 的实例——安静 6.5 小时、看起来像废弃，**然后对方回来了并继续编辑同一个 `src/client.ts`**。干净+安静可以接手；脏+安静无论多久都不能。
- **「绝不让被吞掉的错误读成干净」**：`2>/dev/null` 加上索引锁竞争会让 `git status` 的失败变成 `dirty:0`，而"干净"正是解锁写入的信号。附一条通用判据：**当异常读数会解锁某个行动时，先用不加修饰的命令复核再动手**。

### 覆盖结果

当前 15 个工具全部被至少一个 skill 引用；11 个历史 `.mjs` 按设计不引用（README 已标注为历史）。

## 37. 关键发现：并发会话已完工，且它刻意跳过了测试（2026-10-05 23:55）

### 发现来源

排查工作区活动时，注意到两个不是我建的文件：`task_plan.md` 与 `progress.md`（22:25）。它们是**并发会话的规划与进度记录**，读后全貌清楚。

### 对方的情况

它的任务是把 Microsoft 365 / Microsoft Graph 插件做出来，并补齐 Gmail、Google Drive、Stripe 的只读能力。计划五个阶段**全部标记 complete**，`progress.md` 结尾写着「本轮全部阶段完成」。

关键在它的范围约束里：

> 本轮只运行类型检查、构建和打包预检；**不运行测试套件**，除非用户另行要求

`progress.md` 两次重申「测试套件未运行」。**所以那 4 个包从未跑过测试。**

### 对 4 个交付物的实测

| 插件 | 版本 | 仓库 | 未提交 | 测试套件 | CI | 守卫 |
|---|---|---|---|---|---|---|
| `microsoft-365` | 0.1.0 | **无** | — | **无测试文件** | 无 | 无 |
| `google-drive` | 0.3.0 | 有 | **8** | **✗ 1 失败 / 20 通过** | 有 | 无 |
| `stripe` | 0.2.0 | **无** | — | ✓ 9 通过 | 无 | 无 |
| `gmail` | 0.4.0 | 有 | **8** | **✗ 1 失败 / 83 通过** | 有 | 有（0.3.0 已发布） |

**"不跑测试"的代价具体化了**：4 个交付物里 2 个测试失败、1 个新插件完全没有测试文件（`package.json` 里有 `test: "vitest run"` 脚本，但 `tests/` 目录不存在，638 行源码、8 个工具零覆盖）。

### 两个失败的具体原因

**`google-drive`**：新代码返回 `contentLength` 与 `truncated`，但输出 schema 声明 `additionalProperties: false` 且未列出这两个字段：

```
"value.contentLength" is not a declared property (additionalProperties: false)
"value.truncated" is not a declared property (additionalProperties: false)
```

**`gmail`**：线索附件计数，测试期望 `attachmentCount: 1`，实得 `2`。

两者都与我此前做的守卫工作无关（差异中匹配守卫相关代码的行数为 0），是对方新功能自身的缺陷。

### 这对目标判定的影响

对方**不会回来**——计划已全部完成。所以：

- `google-drive` 的 8 个未提交文件是**其交付物的成品，而非在途半成品**
- `stripe`、`microsoft-365` 没有仓库，是因为对方从未建仓，不是因为"还在建"

但这不改变「我不擅自处理他人未提交工作」的原则。判断依据从"等它释放"变成"**需要你决定如何处置这 4 个已完工但未收尾的交付物**"。

### 顺带更正我此前的一处判断

我在 §21 分析 google-drive 时推测对方"可能仍在编辑"。事实上对方当时确实在编辑（`src/client.ts` 21:43/21:49 有改动），但**那是它本轮的收尾工作，之后它就完工了**。我当时的谨慎（只做快照、不提交）仍然是对的。

## 38. stripe 加固完成（2026-10-06 00:00）

### 动手依据

§37 查明并发会话**已完成全部阶段**（其 `progress.md` 原文「本轮全部阶段完成」），不是"仍在编辑"。用户的指示是「并发会话释放后，你可以立刻做」，而 `stripe` 是三个缺口里状态最干净的：**无未提交文件、8 小时无改动、9 例测试全过**，仅缺仓库。

### 先做可回滚快照

它没有版本控制，出错没有退路。已在 `.verify/snapshot-stripe-0.2.0/` 建立快照（13 个文件 + `SHA256SUMS`）。

### 执行

| 项 | 值 |
|---|---|
| 版本 | 0.2.0 → **0.3.0** |
| 类别 | A 类（`https://api.stripe.com`，纯 SaaS） |
| tests | 9 → **70**（56 向量 + 4 客户端级安全用例 + 原有 10） |
| 门禁 | typecheck / tests / build / pack 全过 |
| 产物 | 含 `lib/url-security.js`（8.4 kB，共 12 个文件） |

客户端接线：`baseUrl` 走 `normalizeBaseUrl`，请求前对 `new URL(this.baseUrl + path)` 执行 `assertSafeUrl`，`EndpointSecurityError` 映射为 `StripeError(status 400)`。

### 守卫确实在跑（实测，非推断）

用临时探针 spec 验证后即删除：

```
http://169.254.169.254 → StripeError: Stripe request URL was rejected by host safety policy.
http://127.0.0.1       → StripeError: ...
http://10.0.0.1        → StripeError: ...
default (api.stripe.com) → fetchRan=true
```

### 一个必须更正的我方判断

我此前反复说「沙箱拦截 DNS，因此本地跑通等于不依赖实时 DNS」——**这个说法不准确**。探针显示默认的 `api.stripe.com` **解析成功了**，stripe 原有测试正是靠实时 DNS 通过的。沙箱并非完全禁 DNS。

结论不变但依据要改：测试**不该依赖实时 DNS**（dockerhub 那次失败就是解析失败触发的 fail-closed）。已为 stripe 的 8 处客户端构造注入 `publicLookup`，套件变为自足。

### 缺口变化

```
GAPS 3 → 2   (stripe 转绿)
已加固 20 → 21
```

### 未完成：提交与 CI 闭环

`stripe` **没有 git 仓库**，因此本轮无法提交、无 CI、无远端。已完成的是一份经过门禁的加固版本（0.3.0）。建仓与否需要你决定——那是比"补守卫"更大的动作，我不擅自做。

## 39. microsoft-365 已是更强的控制：主机钉死，非缺口（2026-10-06 00:10）

### 动手前的发现

准备给 `microsoft-365` 补守卫时，接线完成、typecheck 通过，但加客户端级安全用例后**3 个用例失败**，错误信息揭示了原因：

```
Error: baseUrl must be https://graph.microsoft.com/v1.0; custom hosts are rejected
because the Bearer token must not leave Microsoft Graph.
```

该插件**已经有一道比我的网段黑名单严格得多的控制**——主机精确钉死：

```ts
if (parsed.protocol !== 'https:'
    || parsed.hostname !== 'graph.microsoft.com'
    || parsed.port || parsed.search || parsed.hash
    || parsed.pathname !== '/v1.0') {
  throw new Error('baseUrl must be https://graph.microsoft.com/v1.0; …')
}
```

协议、主机名（全等）、端口、query、fragment、路径**逐项校验**。**我的守卫能拦截的任何地址都不可能通过这个检查**——`169.254.169.254` 不可能是 `graph.microsoft.com`。

### 处置：完全撤销

先从 `.verify/snapshot-microsoft-365-0.1.0/` 校验快照完整性（11 个文件全 OK），再恢复，并逐一比对 SHA256——**11 个文件逐字节一致，完全还原**。生成的 `src/url-security.ts` 与 `tests/` 一并删除，生成器清单中的条目也已移除。

为一处已被更强机制覆盖的地方引入 13 kB 的冗余模块，还要改动他人正常工作的代码，不划算。

### 审计的第二次假缺口

这是审计第二次把"更强或不同的控制"误报成缺口（第一次是 `mongodb`/`redis` 的驱动型连接串）。已新增第四类识别：

```js
function pinsHost(sources) {
  return sources.some(source => /hostname\s*[!=]==?\s*['"][^'"]+['"]/.test(source))
}
```

命中即归入 **host-pinned, guard not applicable**，不再计入缺口。配双向自检（全等比较必须被识别；单纯读取 `hostname` 不得误报）。

### 审计现状（30 个插件，五类相加 = 30）

| 类别 | 数量 |
|---|---|
| 已加固 | 21 |
| 按设计豁免 | 2（kubernetes、monitoring） |
| 连接串不适用 | 3（mongodb、redis、sql） |
| **主机钉死不适用** | **1（microsoft-365）** |
| 无端点 | 2（browser、memory） |
| **缺口** | **1（google-drive）** |

### 一条关于审计本身的教训

审计的判据是"有可配端点字段 + 无 `url-security.ts` → 缺口"。这个判据**既不必要也不充分**：

- 不充分：`stripe` 有 `baseUrl` 字段，但直到我补上守卫前确实没有保护（真缺口）
- 不必要：`microsoft-365` 有 `baseUrl` 字段，却已被主机钉死保护（假缺口）

它是**筛查工具，不是判定工具**。每一条命中都必须人工确认是"确实缺保护"还是"用了别的机制"。两次假缺口说明这个确认步骤不能省。

## 40. google-drive 失败测试的精确诊断（2026-10-06 00:20）

### 失败点

```
FAIL tests/tools.spec.ts > executes export, shared drive, docs, and sheets tools
  ❯ expectValidOutput tests/tools.spec.ts:20:85
  ❯ tests/tools.spec.ts:139:5          ← expectValidOutput(map.gdocs_get_document, doc)
```

不是 `gdrive_export_file`（它的 schema 在 `src/index.ts:224`，**已声明** `contentLength`/`truncated`），而是 **`gdocs_get_document`**。

### 根因

`src/client.ts:179` 的 `limitUtf8()` 返回 `{ value, contentLength, truncated }`，`gdocs_get_document` 把它们透传到输出；但它的 schema（`src/index.ts:266`）只声明了：

```
found, reason, documentId, title, revisionId, text, tabCount, tabs
```

而 `additionalProperties: false`，于是 `contentLength` 与 `truncated` 被判为非法属性。

**两个兄弟工具的 schema 都声明了这两个字段**——`gdrive_export_file`（224 行）与 `gdrive_sheets_get_values`（294 行）。所以这明显是**遗漏，而非设计**：新加的截断披露字段只补进了两个 schema，漏了第三个。

### 修法（一行）

在 `src/index.ts:266` 的 schema 里补上：

```js
contentLength: { type: 'number' }, truncated: { type: 'boolean' }
```

不应反过来从输出中删掉这两个字段——`truncated` 的作用正是告知用户内容被截断，删掉等于取消这个特性。

### 为什么我没有直接改

改它属于**修对方的代码**，与"补一个 endpoint 守卫"是两件事。加上 `google-drive` 的工作树里有对方 8 个未提交文件（是已发布源码的唯一副本，见 §17/§37），提交它们等于把对方的交付物写进历史。

两件事都超出"补守卫"的范围，需要你定夺。**当前状态**：

| 项 | 状态 |
|---|---|
| 对方交付物 | 8 个文件仍未提交，`src/client.ts` 21:49 后冻结 |
| 工作树 | 与快照 `.verify/snapshot-google-drive-0.2.0/` 一致 |
| 唯一剩余缺口 | `google-drive`（本插件） |

## 41. google-drive 收尾，审计归零（2026-10-06 00:40）

### 执行

按 §40 定下的顺序：

1. **修 `gdocs_get_document` 的 schema**：补 `contentLength` / `truncated`（一行）。套件从 1 失败 / 20 通过变为 21 通过。
2. **把对方的交付物作为独立提交入库**（`39771e1`），提交信息注明：这些文件是对方会话报告"全部阶段完成"后遗留的、且是已发布源码的唯一副本；并说明我加的那一行修复及其理由。推送后 **CI 通过**。
3. **补 A 类守卫**（`b5c9487`，0.4.0）：`baseUrl` 与 `tokenUrl` 各自归一化与校验，两个 fetch 点分别守卫；加向量、安全用例、文档；补上它缺失的 `prepare`。83 例全过，门禁全绿，**CI 通过**。

### 一个设计上的要点

`buildUrl()` 接受**绝对 URL**（`/^https?:\/\//` 直接透传）。因此**只在构造时校验 `baseUrl` 是不够的**——调用方可以绕过它传入任意地址。这是本插件有两个 fetch 点、却仍需逐点守卫的实质原因，也是把守卫放在每个 fetch 点而非只在构造函数的理由。

### 审计归零

```
scanned 30 plugins
hardened (22)          已加固
exempt by design (2)   kubernetes, monitoring
connection strings (3) mongodb, redis, sql
host-pinned (1)        microsoft-365
per-site guard coverage (0)    每处 fetch 都有守卫
ci coverage (0 incomplete)     每个仓库都跑 typecheck/test/build
pack-time build guard (0)      每个包发布前都构建
error identity (0)             每个错误类都设 this.name
no unaccounted gaps
```

30 个插件五类相加 = 30，**无缺口，退出码 0**。

### 完整验证套件全绿

```
audit-endpoint-coverage      ok
audit-release-state          ok   无发布完整性问题
verify-generated-files       ok   18 个生成文件与模板一致
verify-vectors-independent   ok   112/112 判定可由 IANA 网段独立复现
verify-published-runtime     ok   17/17 已发布守卫通过
all checks passed
```

### 遗留（均需你授权或不在本目标范围）

| 项 | 说明 |
|---|---|
| `stripe` 无仓库 | 守卫已加、门禁已过（0.3.0），但没有 git 仓库 → 无提交、无 CI。建仓需你授权 |
| `microsoft-365` 无仓库 | 同上，且它已被主机钉死保护，不需要守卫 |
| `gmail` 8 个未提交文件 | 对方的在途工作，测试 1 失败 / 83 通过。已建快照 `.verify/snapshot-gmail-uncommitted/`。不在本目标范围 |
| 待发布 | `airtable@0.2.0`、`sentry@0.2.1`（需浏览器 OTP） |
