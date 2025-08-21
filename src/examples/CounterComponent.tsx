/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { $getNodeByKey, $getState, $setState, type LexicalEditor, type NodeKey } from 'lexical';
import { CounterNode } from './CounterNode';
import { counterValueState } from './counterState';

export function CounterComponent({ editor, nodeKey }: { editor: LexicalEditor; nodeKey: NodeKey }) {
  const [value, setValue] = useState<number>(0);

  // On mount, sync with NodeState or node property
  useEffect(() => {
    editor.getEditorState().read(() => {
      const node = $getNodeByKey(nodeKey) as CounterNode | null;
      if (!node) return;

      // Prefer NodeState if present
      const stateVal = $getState(node, counterValueState);
      const initial = typeof stateVal === 'number' ? stateVal : node.getCount();
      setValue(initial);
    });
  }, [editor, nodeKey]);

  const update = useCallback(
    (delta: number) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey) as CounterNode | null;
        if (!node) return;
        const currentState = $getState(node, counterValueState);
        const current = typeof currentState === 'number' ? currentState : node.getCount();
        const next = current + delta;
        node.setCount(next);
        $setState(node, counterValueState, next);
        setValue(next);
      });
    },
    [editor, nodeKey]
  );

  const styles = useMemo(
    () => ({
      wrapper: { display: 'flex', alignItems: 'center', gap: '8px' },
      label: {
        fontFamily: 'monospace',
        fontWeight: 700,
        padding: '2px 6px',
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '4px',
      },
      btn: {
        padding: '2px 8px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        background: '#f5f5f5',
        cursor: 'pointer',
      },
    }),
    []
  );

  return (
    <div style={styles.wrapper as React.CSSProperties}>
      <span style={styles.label as React.CSSProperties}>Counter: {value}</span>
      <button type="button" style={styles.btn as React.CSSProperties} onClick={() => update(+1)}>
        +1
      </button>
      <button type="button" style={styles.btn as React.CSSProperties} onClick={() => update(-1)}>
        -1
      </button>
    </div>
  );
}
