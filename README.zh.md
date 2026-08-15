# dsh-prometheus

[English](README.md) | 中文

面向 DeepSeek Harness 的 Prometheus 指标插件与可直接导入的 Grafana Dashboard。插件只观察 DSH 的公开生命周期扩展点，在导出前限制指标序列基数，并避免输出对话或工具载荷。

> 发布状态：`0.1.0` 已在本地完成构建与测试，但尚未发布到 npm，也尚未创建公开 GitHub 仓库。

## 监控范围

- 活跃 Session；Agent turn、step、error 及耗时直方图
- LLM 请求速率、终止状态、延迟，以及互不重叠的输入/输出/推理/缓存 token 计数
- Tool 调用速率、规范化成功/失败状态及延迟
- Approval 请求和固定结果计数
- Subagent 启动、结果及耗时
- 后台 job 的活跃/启动/完成/终止/失败数量及耗时
- 进程启动时间和标签溢出诊断

完整指标名、标签和语义见 [docs/metrics.md](docs/metrics.md)。

## 兼容性

| 组件 | 已测试版本 |
|---|---|
| DeepSeek Harness npm packages | `0.1.0-rc.6` |
| 官方源码基线 | `47f943859bef60e4160492346772ded9b24f765a`（2026-08-13） |
| Cordis | `^4.0.1` |
| Node.js | `^22.19.0 || >=24.0.0` |
| prom-client | `15.1.3` |

DeepSeek Harness 当前仍是 Developer Preview。每次升级 DSH 都应视为一次兼容性变更，并执行完整测试与发布清单。

## 安装

在正式发布前，先从当前 checkout 构建 tarball：

```sh
pnpm install --frozen-lockfile
pnpm pack
dsh plugin --profile monitoring add ./dsh-prometheus-0.1.0.tgz
dsh --profile monitoring --dump-config
```

获得授权并发布 npm 后，安装命令将变为：

```sh
dsh plugin --profile monitoring add dsh-prometheus
```

Bundle 会插入 id 为 `prometheus` 的一行。启动 profile 前，请确认 dump 中出现 `dsh-prometheus` layer。

## Endpoint 选择

默认 `mode: auto` 会在插件激活时做一次选择：

1. 如果公开的 DSH `webServer` 已激活且绑定安全，则注册精确的 `/metrics` 路由；
2. 否则在 `127.0.0.1:9464` 启动独立 endpoint。

仓库内的 Docker 示例需要固定 target，建议在 profile 的 `cordis.patch.yml` 中强制 standalone。后应用的 patch 会替换整段 `config`：

```yaml
- id: prometheus
  config:
    enabled: true
    mode: standalone
    host: 127.0.0.1
    port: 9464
    path: /metrics
    allowRemote: false
    maxLabelValues: 64
    maxLabelValueLength: 80
```

### 配置项

| 字段 | 默认值 | 说明 |
|---|---:|---|
| `enabled` | `true` | 不删除 row 的情况下禁用全部 collector 与 endpoint。 |
| `mode` | `auto` | `auto`、`webserver` 或 `standalone`。 |
| `host` | `127.0.0.1` | 独立服务绑定地址：loopback 或 `0.0.0.0`。 |
| `port` | `9464` | 独立服务端口；`0` 仅建议用于测试。 |
| `path` | `/metrics` | 精确路由；必须以 `/` 开头且不能以 `/` 结尾。 |
| `allowRemote` | `false` | 绑定 `0.0.0.0` 或复用对外 WebServer 时必须显式确认。 |
| `maxLabelValues` | `64` | 每个动态标签键允许的不同值数量。 |
| `maxLabelValueLength` | `80` | 动态标签值最大长度。 |

远程暴露没有内置认证或 TLS。启用前请阅读 [SECURITY.md](SECURITY.md)。

## 快速抓取

```sh
curl --fail --silent http://127.0.0.1:9464/metrics
```

Endpoint 支持 GET/HEAD；其他方法返回 `405`；响应禁止缓存并使用 `prom-client` 的 Prometheus/OpenMetrics 兼容 Content-Type。

## Prometheus 与 Grafana

仓库提供完整本地监控栈：

```sh
docker compose -f examples/docker-compose.yml up -d
```

Prometheus 地址为 `http://127.0.0.1:9090`，Grafana 地址为 `http://127.0.0.1:3000`（本地默认 `admin` / `admin`，非本地环境必须修改）。Datasource 和 `DeepSeek Harness / Overview` Dashboard 会自动 provision。

可独立使用的资产位于 [`examples/prometheus.yml`](examples/prometheus.yml) 与 [`grafana/dsh-overview.json`](grafana/dsh-overview.json)。安全、兼容性和验证证据分别见 [`docs/security.md`](docs/security.md)、[`docs/compatibility.md`](docs/compatibility.md) 和 [`docs/verification-report.md`](docs/verification-report.md)。

常用查询：

```promql
# Turn 吞吐
sum(rate(dsh_agent_turns_total[5m]))

# Turn 失败率
sum(rate(dsh_agent_turns_total{status=~"error|blocked|aborted"}[5m]))
/
clamp_min(sum(rate(dsh_agent_turns_total[5m])), 0.000001)

# 按 provider/model 的 P95 LLM 延迟
histogram_quantile(0.95,
  sum by (le, provider, model) (rate(dsh_llm_request_duration_seconds_bucket[5m])))

# 按 tool 的失败速率
sum by (tool) (rate(dsh_tool_calls_total{status!="success"}[5m]))
```

初始告警规则见 [examples/prometheus/alerts.yml](examples/prometheus/alerts.yml)。请按实际负载调阈值；没有任务时吞吐为零是正常现象。

## 隐私与基数控制

Collector 不会导出 prompt、用户/助手消息、system prompt、tool 参数或结果、错误文本、文件路径、工作目录、任意 metadata，也不会导出 session/agent/call/job/subagent id。

只有四类运行时动态标签：`provider`、`model`、`tool` 和 job `kind`。值必须匹配 `[A-Za-z0-9][A-Za-z0-9_.:/-]*`，长度不得超限，并受每个键的数量上限约束。非法或超量值统一映射为 `__other__`；`dsh_metrics_label_overflow_total` 只记录发生次数，不记录原值。

provider/model/tool/kind 名称仍属于运维 metadata，请勿把客户标识或秘密放入这些名称。

## 生命周期

所有 listener、job observer、路由、socket 和 registry 都属于插件的 Cordis fiber。热重载或卸载时，Web 路由会注销；独立服务器会停止接受连接并关闭剩余 socket。Registry 是实例私有的，重载不会与进程全局 collector 冲突。

已有 live session 和 job 只用于初始化 gauge；不会回放历史事件填充 counter。进程重启或热重载造成 counter reset 属于正常 Prometheus 语义。

## 升级、降级与卸载

```sh
# 获取新版本 tarball 后升级
dsh plugin --profile monitoring add ./dsh-prometheus-NEW.tgz
dsh --profile monitoring --dump-config

# 删除依赖和 bundle layer
dsh plugin --profile monitoring remove dsh-prometheus
```

降级前请比较 [CHANGELOG.md](CHANGELOG.md) 中的指标和配置契约。卸载插件不会删除 Prometheus 已保存的数据。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm pack
```

测试覆盖配置/基数、隐私、LLM/tool waterfall、endpoint 方法、远程暴露门禁、WebServer 路由卸载、独立 socket 卸载、job/subagent 生命周期，以及真实 rc.6 AgentLoop turn。参见 [CONTRIBUTING.md](CONTRIBUTING.md)、[docs/architecture.md](docs/architecture.md) 和 [docs/release-checklist.md](docs/release-checklist.md)。

## 排障与限制

参见 [docs/troubleshooting.md](docs/troubleshooting.md) 和 [docs/known-limitations.md](docs/known-limitations.md)。

## 许可证

MIT
