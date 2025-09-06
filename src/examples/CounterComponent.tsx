/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {NodeKey} from 'lexical';
import type {JSX} from 'react';

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {mergeRegister} from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {useCallback, useEffect, useRef} from 'react';

import {$isCounterNode, type CounterNode} from './CounterNode';

export default function CounterComponent({
  value,
  nodeKey,
}: {
  value: number;
  nodeKey: NodeKey;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const ref = useRef<HTMLDivElement>(null);

  const withCounterNode = (
    cb: (node: CounterNode) => void,
    onUpdate?: () => void,
  ): void => {
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isCounterNode(node)) {
          cb(node);
        }
      },
      {onUpdate},
    );
  };

  const onDelete = useCallback(
    (payload: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        const event: KeyboardEvent = payload;
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isCounterNode(node)) {
          node.remove();
          return true;
        }
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const onIncrement = useCallback(() => {
    withCounterNode((node) => {
      node.increment();
    });
  }, []);

  const onDecrement = useCallback(() => {
    withCounterNode((node) => {
      node.decrement();
    });
  }, []);

  const onReset = useCallback(() => {
    withCounterNode((node) => {
      node.setValue(0);
    });
  }, []);

  const onClick = useCallback(
    (payload: MouseEvent) => {
      const event = payload;
      if (event.target === ref.current) {
        if (event.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }
      return false;
    },
    [isSelected, setSelected, clearSelection],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if ($isNodeSelection($getSelection())) {
            return false;
          }
          clearSelection();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [clearSelection, editor, onClick, onDelete]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        clearSelection();
      }
    };

    if (isSelected) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [clearSelection, isSelected]);

  return (
    <div
      className={`counter-component ${isSelected ? 'selected' : ''}`}
      ref={ref}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        backgroundColor: isSelected ? '#e3f2fd' : '#f9f9f9',
        fontFamily: 'monospace',
        fontSize: '14px',
        userSelect: 'none',
        cursor: 'pointer',
      }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDecrement();
        }}
        style={{
          background: '#dc3545',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
        }}
        title="Decrement">
        -
      </button>
      <span
        style={{
          minWidth: '24px',
          textAlign: 'center',
          fontWeight: 'bold',
        }}>
        {value}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onIncrement();
        }}
        style={{
          background: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
        }}
        title="Increment">
        +
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
        style={{
          background: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '3px',
          padding: '4px 8px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          marginLeft: '4px',
        }}
        title="Reset to 0 (demonstrates NodeState)">
        R
      </button>
    </div>
  );
}
