/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {JSX} from 'react';

import {registerCodeHighlighting} from '@lexical/code';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useEffect} from 'react';

export default function CodeHighlightPrismPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerCodeHighlighting(editor);
  }, [editor]);

  return null;
}
