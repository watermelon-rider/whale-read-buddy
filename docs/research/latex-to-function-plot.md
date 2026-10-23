# 公式 → 函数图像：方案评估

> 需求：公式旁的按钮点开渲染交互式函数图像，可输入 x 看 (x, f(x)) 在图上的位置。
> 调研日期：2026-10-24（两个子 agent 调研均卡在沙箱网络审批，本报告由主 agent 直接查证完成）。

## 候选库现状（npm 实测）

| 库 | 最新版 | 定位 | 适配度 |
|---|---|---|---|
| math-expressions | 3.0.0-alpha.1 | Doenet/Desmos 系，LaTeX→AST→求值 | 可用但长期 alpha，API 稳定性一般 |
| nerdamer | 2.0.0 | 符号计算 CAS，`convertFromLaTeX` + `evaluate` | **推荐**：LaTeX→普通表达式一行转换，维护刚复活 |
| mathjs | 15.2.0 | 通用数学库 | 不能解析 LaTeX（只能导出），出局 |
| algebrite | 1.4.0 | CoffeeScript CAS | 多年未动，出局 |
| function-plot | 1.26.0 | D3 系 2D 函数绘图，自带表达式解析器 | **推荐**：离线、自带 pan/zoom、支持自定义数据系列 |
| JSXGraph | 1.14.1 | 交互几何/绘图 | 功能过重（几何为主），出局 |
| Desmos embed | - | 官方计算器嵌入 | 需远程加载 desmos.com 脚本，违反 MV3 CSP + 离线不可用，出局 |

## 推荐管线

```
LaTeX（我们已有，MathBlock 拿到的 tex 源码）
  → nerdamer.convertFromLaTeX()          // \frac{x^2}{2} → x^2/2
  → 收集自由变量（单变量才可画）           // nerdamer(expr).variables()
  → function-plot 渲染（自带解析器直接吃普通表达式，自带 pan/zoom）
  → 输入 x：nerdamer.evaluate() 算 f(x)，向图上追加 scatter 点 + 标注
```

- 绘图放在已有的 `viewer.html` 整窗口查看器里（plot 模式），不挤侧边栏。
- function-plot 与 nerdamer 都在查看器入口**懒加载**（动态 import），不进主包。

## 关键边界（诚实交互）

「任意公式 → 二维函数图像」只在**单变量显式函数**时有意义。陪读场景大量公式是 softmax、注意力、矩阵形状这类多变量/非函数式。

策略：点按钮时先解析；自由变量 ≠ 1 时按钮给禁用态并提示「这个公式画不成二维函数图像」，不假装能画。

## 实施清单

1. `pnpm add nerdamer function-plot`
2. MathBlock 旁加「函数图像」按钮（Zoomable 工具条里，copyText 左侧）。
3. viewer.html 增加 `?mode=plot&tex=...`：解析 → 可画则 function-plot + x 输入框标点；不可画则展示禁用提示。
4. 测试：softmax/attention 类公式应给出禁用提示；`y=\sin(x)/x` 类正常出图。
