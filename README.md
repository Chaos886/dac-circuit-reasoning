# DAC Circuit Reasoning

**研究初稿 / Research draft — 2026-10-15**

当前主线：**Cycle-Level Circuit Reasoning with Language Models: State Errors, Propagation, and Recovery**。

研究大模型能否逐时钟周期推导数字电路状态、错误如何传播/被输出掩盖/恢复，以及可信状态反馈是否改善下游任务。已有可运行评测器、48 个原创诊断任务、两个 benchmark 参考设计的候选转写和论文初稿。**尚无真实 LLM 受控实验；候选转写未完成 HDL 仿真核验；不是已经完成的 DAC 投稿稿。**

## 阅读入口

- [当前英文初稿](paper/draft.md) / [原位更新的 LaTeX](paper/main.tex)
- [逐周期状态、错误传播与实验设计](docs/STATE_REASONING_ZH.md)
- [VerilogEval / RTLLM / FVEval 接入](docs/BENCHMARKS_ZH.md) / [版本与源码清单](benchmarks/sources.json)
- [主张—证据登记](docs/CLAIM_EVIDENCE.md) / [当前交付状态](docs/STATUS_ZH.md)
- [本次自动选择技能要求与可用目录](docs/SKILL_POLICY_ZH.md)
- [DAC 2027 官方要求记录](docs/DAC2027_REQUIREMENTS_ZH.md) / [路线图](docs/ROADMAP_ZH.md)

## 复现

Node.js 22+，没有第三方依赖，无需 npm install。在本仓库目录执行：

```sh
npm test
npm run pilot
npm run trace:pilot
node src/score_trace.mjs results/trace-tasks.jsonl results/trace-reference.jsonl
node src/score_trace.mjs benchmarks/adapted-tasks.jsonl results/benchmark-adapter-reference.jsonl
```

最后两条命令是参考重放检查，不是模型评测。真实模型预测应另存 JSONL，再交给相同评分入口；不得将参考轨迹提供给模型。模型输入是固定电路描述/转移规则、初态和刺激。当前没有模型服务驱动或付费调用。

## 实际已完成

- 原组合检查器 56/56 测试、新状态评测器 35/35 测试通过。独立小型规格覆盖同步更新、复位优先级、保持、溢出、并发读写、错误传播、恢复和无效输入。
- 48 个合成任务，每个对照条件 720 个周期。参考重放 48/48 整轨迹正确；人工翻转状态位的对照 0/48 整轨迹正确、48/48 最终状态正确，共 151 个错误状态周期。所有任务含中途复位，**不能据此估计自然错误恢复率或 LLM 能力**。
- 核对 3 个官方 benchmark 仓库的固定提交和 7 个参考源。VerilogEval 的同步 FSM、RTLLM 的 8 位右移寄存器提供两个候选 AST 转写；通过 520 个单步赋值的方程级对照，尚未验证原 HDL 到 AST 的等价性。
- 原组合电路 pilot 保留：27 例，21 通过、6 拒绝；412 个赋值。与状态轨迹分开报告。

报告：[状态对照](results/trace-pilot-results.json)、[状态测试](results/trace-test-results.json)、[适配检查](results/benchmark-adapter-checks.json)、[组合检查](results/pilot-results.json)。

## 语义边界

状态任务采用 s(t+1)=T(s(t),x(t))，同步使用旧状态；在寄存器更新和组合逻辑稳定后采样输出。输入在采样期间保持。需要明确初态、复位与每周期输入。当前支持两态、单时钟，状态位加输入位最多 16，最长 256 周期；不支持通用 HDL 解析、X/Z、多时钟、异步复位事件或模拟电路。

评分同时看参考状态正确性、相对预测前缀的转移一致性、输出正确性、首次错误和重新汇合。正确的最终答案不能证明中途推导正确；错误中间状态也不保证所有后续答案错误。公开解释文本不是隐藏推理机制的直接证据。

## 保留的组合电路支线

原 [契约研究稿](paper/contract-study.md)、[组合推导](paper/DERIVATIONS_ZH.md)、[实验协议](docs/EXPERIMENT_PROTOCOL.md) 和 [候选接口](docs/LLM_PROPOSAL_PROTOCOL.md) 仍可使用。局部替代必须同时满足环境覆盖和条件等价；其定理不构成时序等价证明。AST 门数不能表述为面积、时延或功耗。

## 投稿与责任

DAC 2027 摘要截止北京时间 **2026-11-12 09:00**，全文 **2026-11-19 09:00**；此前已核对的要求为 IEEE 双栏、正文最多 6 页另加 1 页仅参考文献、双盲。正式投稿前复核 [官方页面](https://dac.com/2027/program/research-manuscript-submissions)。

论文保留 AI 使用披露。作者尚需核验创新性、参考真值、模型实验、引用和最终页数。GitHub 是研究保存位置，不能把含身份信息的仓库入口直接当作匿名审稿工件。本项目没有添加开源许可证；第三方 benchmark 许可单独记录。
