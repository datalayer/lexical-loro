import React, { useCallback, useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  $createParagraphNode
} from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode } from '@lexical/rich-text';
import { $createCodeNode } from '@lexical/code';
import { $createCounterNode } from './CounterNode';
import { INSERT_TABLE_COMMAND } from '@lexical/table';

interface LexicalToolbarProps {
  className?: string;
}

export const LexicalToolbar: React.FC<LexicalToolbarProps> = ({ className = '' }) => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update text format states
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      
      // Update block type
      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();
      
      const elementType = element.getType();
      if (elementType === 'heading') {
        // Use duck typing to safely access the tag property
        const tag = (element as { getTag?: () => string }).getTag?.();
        setBlockType(tag || 'h1');
      } else if (elementType === 'code') {
        setBlockType('code');
      } else {
        setBlockType('paragraph');
      }
    }
  }, []);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      1, // Low priority
    );
  }, [editor, updateToolbar]);

  const formatText = useCallback(
    (format: 'bold' | 'italic' | 'underline') => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const formatParagraph = useCallback(
    (blockType: string) => {
      if (blockType === 'table') {
        // Insert a 5x5 table
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: '5',
          rows: '5',
        });
        // Reset to paragraph after inserting table
        setBlockType('paragraph');
        return;
      }
      if (blockType === 'counter') {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const node = $createCounterNode(0);
            selection.insertNodes([node]);
          }
        });
        setBlockType('paragraph');
        return;
      }
      
      if (blockType !== 'paragraph' && blockType !== 'h1' && blockType !== 'code') {
        return;
      }
      
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if (blockType === 'paragraph') {
            $setBlocksType(selection, () => $createParagraphNode());
          } else if (blockType === 'h1') {
            $setBlocksType(selection, () => $createHeadingNode('h1'));
          } else if (blockType === 'code') {
            $setBlocksType(selection, () => $createCodeNode());
          }
        }
      });
      
      // Update the block type state immediately
      setBlockType(blockType);
    },
    [editor],
  );

  return (
    <div className={`lexical-toolbar ${className}`}>
      <div className="lexical-toolbar-group">
        <select
          className="lexical-toolbar-select"
          value={blockType}
          onChange={(e) => formatParagraph(e.target.value)}
          aria-label="Block type"
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="code">Code</option>
          <option value="table">Table (5x5)</option>
          <option value="counter">Counter</option>
        </select>
      </div>
      
      <div className="lexical-toolbar-group">
        <button
          type="button"
          className={`lexical-toolbar-button ${isBold ? 'active' : ''}`}
          onClick={() => formatText('bold')}
          aria-label="Format text as bold"
          title="Bold (Ctrl+B)"
        >
          <span className="toolbar-icon">B</span>
        </button>
        
        <button
          type="button"
          className={`lexical-toolbar-button ${isItalic ? 'active' : ''}`}
          onClick={() => formatText('italic')}
          aria-label="Format text as italic"
          title="Italic (Ctrl+I)"
        >
          <span className="toolbar-icon italic">I</span>
        </button>
        
        <button
          type="button"
          className={`lexical-toolbar-button ${isUnderline ? 'active' : ''}`}
          onClick={() => formatText('underline')}
          aria-label="Format text as underline"
          title="Underline (Ctrl+U)"
        >
          <span className="toolbar-icon underline">U</span>
        </button>
      </div>
    </div>
  );
};
