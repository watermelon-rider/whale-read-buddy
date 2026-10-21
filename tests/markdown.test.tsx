/**
 * AssistantContent 渲染回归测试（react-dom/server，无需浏览器）：
 * ** 加粗配对不得被 Annotation chip 替换破坏。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantContent } from '../src/ui/chat/MessageBubble';
import type { AnnotationItem } from '../src/types';

const annotations: AnnotationItem[] = [
  { index: 4, quote: 'persona', note: '是什么意思', source: { kind: 'page' } },
];

describe('AssistantContent', () => {
  it('段落开头的 **加粗** 正常渲染', () => {
    const html = renderToStaticMarkup(
      <AssistantContent content={'**还是没有。**我这边能看到内容。'} />,
    );
    expect(html).toContain('<strong>还是没有。</strong>');
    expect(html).not.toContain('**');
  });

  it('Annotation chip 与加粗共存：加粗不被切断', () => {
    const html = renderToStaticMarkup(
      <AssistantContent
        content={'**Annotation 4：「persona」是什么意思**\n\n拉丁语里的"面具"。'}
        replyAnnotations={annotations}
      />,
    );
    // chip 出现在 strong 内部，加粗标签完整
    expect(html).toContain('<strong>');
    expect(html).toContain('dr-reply-anno');
    expect(html).toContain('是什么意思');
    expect(html).not.toContain('**');
  });

  it('普通文本里的 Annotation N：也替换为 chip', () => {
    const html = renderToStaticMarkup(
      <AssistantContent content={'Annotation 4：这是回应'} replyAnnotations={annotations} />,
    );
    expect(html).toContain('dr-reply-anno');
  });
});
