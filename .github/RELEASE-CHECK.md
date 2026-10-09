# release-check 门禁

.github/workflows/release-check.yml 在每个 Pull Request 上运行统一发布检查：

- 准备全部 dsh-tool-* 插件目录；缺失且有明确 allowlist 的公开仓库时浅克隆，未登记的目录直接失败。
- 为每个插件执行 npm ci --ignore-scripts。
- 执行 node scripts/release-check.mjs --strict-output，覆盖凭据扫描、endpoint allowlist、输出上限、typecheck、build 和 npm pack --dry-run。
- 任一步骤非零都会使名为 release-check 的 job 失败；失败 job 不会成为可通过的 PR 检查。
- 无论成功或失败，都上传 release/*.json 并写入 Job Summary。

## 启用合并阻断

工作流必须放在包含 scripts/release-check.mjs、scripts/ci/prepare-plugin-workspace.mjs、release/plugin-repositories.json 和全部本地插件目录的 GitHub 聚合仓库中。当前工作目录的插件是多个独立 Git 仓库，目录本身没有 GitHub 远程；因此本地文件落盘后，仍需把这些文件提交到该聚合仓库。

在聚合仓库的分支保护规则或 Ruleset 中，把 release-check 设为 required status check，并启用“分支必须是最新状态”策略。GitHub Actions 使用 contents: read，没有写权限或 PR secrets。
