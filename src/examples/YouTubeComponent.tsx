/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { ElementFormatType, NodeKey } from 'lexical';
import { BlockWithAlignableContents } from '@lexical/react/LexicalBlockWithAlignableContents';

export type YouTubeComponentProps = Readonly<{
  className: Readonly<{
    base: string;
    focus: string;
  }>;
  format: ElementFormatType | null;
  nodeKey: NodeKey;
  videoID: string;
}>;

export function YouTubeComponent({
  className,
  format,
  nodeKey,
  videoID,
}: YouTubeComponentProps) {
  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}
    >
      <iframe
        width="560"
        height="315"
        src={`https://www.youtube.com/embed/${videoID}`}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="YouTube video"
      />
    </BlockWithAlignableContents>
  );
}
