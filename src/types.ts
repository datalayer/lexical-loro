/**
 * TypeScript type definitions for Lexical editor state structure
 */

export interface LexicalNode {
  type: string;
  version: number;
  direction?: 'ltr' | 'rtl';
  format?: string | number;
  indent?: number;
  children?: LexicalNode[];
}

export interface LexicalTextNode extends LexicalNode {
  type: 'text' | 'code-highlight';
  detail: number;
  mode: 'normal' | 'token' | 'segmented';
  style: string;
  text: string;
  highlightType?: string;
}

export interface LexicalElementNode extends LexicalNode {
  type: 'root' | 'paragraph' | 'heading' | 'list' | 'listitem' | 'code';
  children: LexicalNode[];
}

export interface LexicalHeadingNode extends LexicalElementNode {
  type: 'heading';
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export interface LexicalParagraphNode extends LexicalElementNode {
  type: 'paragraph';
  textFormat?: number;
  textStyle?: string;
}

export interface LexicalListNode extends LexicalElementNode {
  type: 'list';
  listType: 'bullet' | 'number' | 'check';
  start: number;
  tag: 'ul' | 'ol';
}

export interface LexicalListItemNode extends LexicalElementNode {
  type: 'listitem';
  checked?: boolean;
  value: number;
}

export interface LexicalCodeNode extends LexicalElementNode {
  type: 'code';
  language?: string;
}

export interface LexicalRootNode extends LexicalElementNode {
  type: 'root';
}

export interface LexicalEditorState {
  root: LexicalRootNode;
}

export interface LexicalDocumentState {
  editorState: LexicalEditorState;
  lastSaved: number;
  source: string;
  version: string;
}

// Event types for collaboration
export interface LexicalEvent {
  type: 'node-added' | 'node-removed' | 'node-updated' | 'text-changed';
  path: number[];
  nodeId?: string;
  oldValue?: any;
  newValue?: any;
}

// Change source tracking
export type ChangeSource = 'local' | 'remote' | 'undo' | 'redo';

// Update directions for Mirror
export type UpdateDirection = 'app-to-loro' | 'loro-to-app';
