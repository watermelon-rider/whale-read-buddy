/**
 * KaTeX 渲染回归：用户实测出问题的 softmax 原文。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantContent } from '../src/ui/chat/MessageBubble';

const RAW = `先把工具摆上，你就明白我问的是什么了：

$$
\\mathrm{softmax}(s)_i=\\frac{e^{s_i}}{\\sum_{j} e^{s_j}}
$$

注意下面那个 $\\sum_j$，它把**所有** $j$ 都扫了一遍。这就是题眼所在。

**题目**`;

describe('katex', () => {
  it('多行 $$ 块级公式渲染为 katex-display，且不被 ** 处理破坏', () => {
    const html = renderToStaticMarkup(<AssistantContent content={RAW} />);
    expect(html).toContain('katex-display');
    expect(html).toContain('katex');
    // 行内公式
    expect(html.match(/katex/g)!.length).toBeGreaterThan(2);
    // CJK 加粗仍然生效
    expect(html).toContain('<strong>所有</strong>');
    expect(html).toContain('<strong>题目</strong>');
    // 不应残留原始 $$ 围栏
    expect(html).not.toContain('$$');
    // katex 渲染必须保留内联样式（strut/vlist 布局依赖）
    expect((html.match(/style=/g) || []).length).toBeGreaterThan(10);
  });
});
