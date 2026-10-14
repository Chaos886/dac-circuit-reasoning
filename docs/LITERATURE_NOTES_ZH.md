# 文献与创新边界核对记录

核对日期：2026-10-14。以下资料通过原论文或官方工具页面读取；不是穷尽性系统综述。引用论文的自报结果不视为本项目复现实验。

| 资料 | 已核对事实 | 对本研究的要求 |
|---|---|---|
| Cuyckens et al., *Ares: Adaptive Reasoning-Effort Steering for PPA- and Cost-Aware RTL Optimization with LLM Agents*, arXiv:2607.27879v1, 2026 | 已有LLM修改、功能检查、综合和PPA分析循环；重点包含按调用计费和推理预算调节 | 不能把“闭环”“成本意识”作为未经对照的首创；计入模型及工具成本 |
| Fang et al., *Dr. RTL: Autonomous Agentic RTL Optimization through Tool-Grounded Self-Improvement*, arXiv:2604.14989v2, 2026 | 临界路径分析、并行RTL改写、工具评估、可复用技能库；使用时序等价检查 | 单纯LLM加验证器缺乏足够差异；本文目前只支持更窄的两态组合语义 |
| Lu et al., *A New Benchmark for the Appropriate Evaluation of RTL Code Optimization*, arXiv:2601.01765v1, 2026 | RTL-OPT包括36个手工设计任务，涵盖组合、流水、状态机及存储接口；有优化前后参考 | 可评估合法的组合子集；不得把全部36个设计自动当作组合电路，更不能以教科书恒等式代替真实设计 |
| YosysHQ, *Yosys Open SYnthesis Suite*, 官方仓库 | RTL综合框架、综合脚本与现有算法 | 应固定版本并调参比较，默认单次运行不能自动视为最强基线 |
| Berkeley ABC, *System for Sequential Logic Synthesis and Formal Verification*, 官方仓库 | README展示DAG-aware AIG rewriting与等价检查 | 已验证的电路重写有成熟基础；本文组合正确性命题是基础依据，不是新的形式验证理论 |

原始链接：

- https://arxiv.org/html/2607.27879v1
- https://arxiv.org/html/2604.14989v2
- https://arxiv.org/abs/2601.01765
- https://github.com/YosysHQ/yosys
- https://github.com/berkeley-abc/abc

## 必须补齐的最接近工作审查

搜索发现 Cornell 作者站上的 Cedar 论文：
https://www.csl.cornell.edu/~zhiruz/pdfs/cedar-iccad2026.pdf

搜索结果题名以 “Cedar: Learning to Optimize RTL via Accumulating Verified ...” 开头。此会话的内置PDF页面未提供可读正文，尚未核对完整题名、作者、正式发表信息、规则条件与实验。因此不把搜索摘要当作充分证据，也不对其方法缺陷作断言。正式投稿前必须阅读全文，重点比较：已验证规则积累、条件式重写、规则复用、上下文条件及证明预算。

还需系统核对 RTLRewriter、equality saturation、conditional rewriting、satisfiability don't-cares、assume-guarantee reasoning、CEGIS/CEGAR 与局部精确重综合。初稿没有完成这一步，不能声称方法“首次”。

## 可检验的候选区别

聚焦固定外部假设 A、边界映射 B、局部条件 C 的证据链，而不是让模型自行缩小合法输入空间。两项义务分别为 A(x) => C(B(x)) 与 C(u) => F(u)=F'(u)。待证明的研究价值是：在相同预算与强基线下，某个具体条件提取/反馈机制是否产生更多经过验证且映射后有收益的候选。

当前只完成有限Boolean模型中的基础检查器、小型合成例子与研究初稿。没有证据表明这种研究定位本身已具有足够新意，亦没有LLM或PPA优势数据。
