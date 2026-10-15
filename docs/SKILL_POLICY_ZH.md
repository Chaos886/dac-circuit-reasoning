# 本次技能选择说明

记录日期：2026-10-15。以下概述用户提供的 AGENTS.md 偏好及本次执行情况，不是对全部技能的加载声明。

## 自动选择要求

用户可以直接描述任务，无需逐项选择 skill。我根据当前会话实际列出的、已安装可用的技能选择最贴合任务的一组，先读取 SKILL.md 再执行；不要仅因关键词相同就全量加载，功能重复或无关的技能不加载。用户当次明确要求优先；明确设为“仅显式调用”的技能仍须尊重。缺失的技能不能声称已使用。

AI/LLM 与 IC/EDA 学习、研究写作默认使用 academic-rigor；文献、统计、RTL 和形式验证按实际需要组合。DAC 投稿要求按对应年份的官方规则核对，不拿 ML 或系统会议规范替代。技能不能保证学术正确性、录用或 AI 检测结论。

选择技能本身不授权安装软件、上传研究材料、付费调用或昂贵训练。本项目的 GitHub 保存来自用户此前明确请求；不存在仅因 skill 可用而自动上传的规则。保持事实、推导、合成示例和待验证假设的区别。

## 本轮实际读取与使用

| 技能 | 用途与边界 |
|---|---|
| academic-rigor | 证据分级、数学假设、论文结论强度与主张—证据登记 |
| literature-review | 官方 benchmark 的定向检索、版本和任务定义核验；未声称系统综述完成 |
| formal-verification | 状态、时钟、复位、可达性、有限轨迹与无界证明的区分；没有运行 JasperGold |
| readable-verilog-generator | 查阅了技能及分派要求以判断 RTL 工作范围；本轮未执行其完整 RTL 生成/验证工作流，也未生成新 RTL 模块 |

## 当前目录中可用的学术相关技能

- 研究与审查：academic-rigor、literature-review、citation-management、scientific-critical-thinking。
- 论文与语言：ml-paper-writing、systems-paper-writing、humanizer:humanizer。前两者各有领域/会议范围，不能直接充当 DAC 模板。
- 统计与模型实验：statistical-analysis、evaluating-llms-harness、nanogpt、peft-fine-tuning。通用 LLM harness 不原生提供芯片状态推导任务。
- 数字电路：readable-verilog-generator、formal-verification。不代表已具备模拟设计、物理设计或 signoff 工具与许可证。
- 学术交付辅助：pdf:pdf、documents:documents、presentations:Presentations、spreadsheets:Spreadsheets、visualize:visualize。

上述“可用”不等于本轮都已读取、调用或完成对应工作流。实际加载范围以本节记录和工具执行为准。
