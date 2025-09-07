/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {LexicalCommand} from 'lexical';

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$insertNodeToNearestRoot} from '@lexical/utils';
import {createCommand, COMMAND_PRIORITY_EDITOR} from 'lexical';
import {useEffect} from 'react';

import {$createCounterNode, CounterNode} from '../../nodes/CounterNode';

export const INSERT_COUNTER_COMMAND: LexicalCommand<number | undefined> =
  createCommand('INSERT_COUNTER_COMMAND');

export default function CounterPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([CounterNode])) {
      throw new Error('CounterPlugin: CounterNode not registered on editor');
    }

    return editor.registerCommand<number | undefined>(
      INSERT_COUNTER_COMMAND,
      (payload) => {
        const counterNode = $createCounterNode(payload || 0);
        $insertNodeToNearestRoot(counterNode);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor]);

  return null;
}
