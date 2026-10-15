# 芯片设计 benchmark 接入与证据边界

核对日期：2026-10-15。采用官方仓库的 README、LICENSE、目录树和所列源文件进行定向范围调查；不是穷尽文献的系统综述。版本、链接和 SHA-256 记录见 [sources.json](../benchmarks/sources.json)。没有将原 benchmark 的成绩移植成本项目的成绩。

| 来源 | 核实的原任务 | 本项目用途 | 接入状态 |
|---|---|---|---|
| [VerilogEval](https://github.com/NVlabs/verilog-eval) | 代码补全、spec-to-RTL；V2 仅 HumanEval，原版保留于 release/1.0.0 | 小型状态机、寄存器、计数器的 trace 派生任务 | 审阅 4 个参考设计；1 个候选手工转写 |
| [RTLLM](https://github.com/hkust-zhiyao/RTLLM) | 自然语言生成 RTL、testbench 功能检查、综合后质量 | 更长数据通路与控制逻辑的状态推导 | 审阅 3 个参考设计；1 个候选手工转写 |
| [FVEval](https://github.com/NVlabs/FVEval) | NL2SVA-Human、NL2SVA-Machine、Design2SVA | 未来下游断言任务：状态推导错误是否影响属性判断/断言生成 | 只完成任务与来源映射；完整流程依赖 Cadence Jasper |
| RTL-OPT36 | RTL 优化评测；此前已核对 arXiv:2601.01765v1 | 未来检查状态错误与优化候选正确性的关系 | 不作为当前状态轨迹数据；尚未接入 |

固定修订：VerilogEval `c498220d0a52248f8e3fdffe279075215bde2da6`；RTLLM `51ed553d0ffd32797a1a0a13e051656bf302c81f`；FVEval `141afe7dcf03a0b86547b94657d9d610b6087724`。仓库 LICENSE 分别为 MIT、MIT、Apache-2.0；文件级和第三方数据条款仍须逐项保留，仓库许可不是任意来源数据的授权。

RTLLM 当前 README 标为 v2.1（2026-08-15 修正描述、testbench 和设计）。其中还保留旧版“29 designs”文字，v2 段写 50 个设计。不能把旧论文 v1.0 结果、v2.0 数量和 v2.1 修订混用；本项目以固定提交及实际纳入清单为准。

## 源码审阅带来的接入决定

| 参考源 | 发现 | 处理 |
|---|---|---|
| VerilogEval Prob031 dff | initial q=X | 不默认改成 0；需定义首个确定性写入之后的起点或四态任务 |
| VerilogEval Prob075 counter_2bc | 异步高有效复位到 1，饱和计数 | 暂缓；不能简化成同步复位或模 4 计数 |
| VerilogEval Prob085 shift4 | 异步复位、load 优先于 ena | 暂缓事件语义适配 |
| VerilogEval Prob107 fsm1s | 同步复位到 B=1；in 为 0 时翻转状态 | 手工映射状态位；任务从一次复位前导结束后开始 |
| RTLLM counter_12 | 异步低有效复位、模 12 计数 | 暂缓；不能混入二态同步原型 |
| RTLLM fsm | 异步复位、case 未覆盖全部编码、组合块采用非阻塞赋值 | 暂缓；先查可达状态、事件调度和参考 testbench |
| RTLLM right_shifter | initial q=0；先 q 右移，再 q[7]<=d | 手工映射为 8 个位的同步更新，保留高位覆盖关系 |

两份手工转写在 `src/benchmark_adapters.mjs`，已提供任务 JSONL 和方程级对照结果。其意义是“可检查的候选适配”，**未运行原始 HDL，也未证明 HDL 与 AST 等价**。源源码没有复制进入发布内容；保留上游固定链接和哈希。正式纳入测试集前必须完成下面的流程。

## 从 benchmark 变成状态推导测试集

1. 以参考 RTL 和独立规格为准，记录原任务 ID、提交、文件哈希、许可及所有修改。生成的候选 RTL 不能充当真值。
2. 明确状态信号、位宽、符号/溢出、时钟、复位极性与同步性、初态、输入时序、采样点。给未知初态的任务保留符号值或明确单列；不要悄悄删除困难用例而不报告覆盖损失。
3. 仿真器先通过原 testbench，再导出目标输入下的逐周期信号；采用第二种实现或形式检查审计参考轨迹。Icarus/Verilator 的版本与四态支持不可混同。VerilogEval README 指定 Icarus v12，并提示不支持开发版 v13。
4. 对当前 AST 子集，完成 RTL 到状态转移的映射审核；超出 16 个状态位+输入位、异步复位或多时钟的实例暂不计分，记录未支持的原因。不能用手工缩位后的设计声称复现原设计。
5. 用固定 JSON schema 导出任务和模型预测。模型输入包含待理解电路/语义定义、初态及刺激，不包含参考轨迹。AST 输入模式衡量转移规则执行；RTL 输入模式额外衡量 RTL 理解，两者分开报告。
6. 为同一电路生成不同长度、复位位置和输入熵的波形；按设计家族切分。原版生成任务与派生 trace 任务分别命名、分别打分。
7. 后续下游任务增加最终输出、断言真伪/反例、故障定位或候选改写判定。先证明状态错误的诊断价值，再检验对 EDA 工作的实际影响。

## 需要补齐的最近工作比较

FVEval 已涉及模型辅助形式验证，VerilogEval/RTLLM 已评估硬件生成能力；“加验证器”“输出 CoT”“用 LLM 解释 RTL”本身都不足以主张创新。还需系统检索现有 waveform/trace reasoning 与 circuit reasoning 工作，比较其状态标注粒度、错误干预、恢复协议和下游任务。在完成检索和模型实验前，论文只能提出研究问题，不能声称首创或达到 DAC 录用标准。
