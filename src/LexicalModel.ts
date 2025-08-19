import { Mirror } from '@loro-mirror/core';
import { LoroDoc } from 'loro-crdt';
import { produce } from 'immer';
import type { LexicalEditorState, LexicalNode } from './types';
import lexicalSchema from './schema/lexicalSchema';

export type ChangeCallback = (state: LexicalEditorState) => void;

export class LexicalModel {
  doc: any;
  mirror: Mirror<any>;
  private callbacks: Set<ChangeCallback> = new Set();

  constructor(initialState?: any) {
    this.doc = new LoroDoc();
    this.mirror = new Mirror({ doc: this.doc, schema: lexicalSchema, initialState });
    this.mirror.subscribe((state) => {
      try {
        const s = state.editorState as LexicalEditorState;
        this.callbacks.forEach((cb) => cb(s));
      } catch (e) {
        // swallow
      }
    });
  }

  getState(): LexicalEditorState {
    return this.mirror.getState().editorState as LexicalEditorState;
  }

  // The updater can either mutate the passed-in draft editorState (preferred)
  // or return a new editorState object. If the updater returns undefined, we assume
  // it mutated the draft in-place (immer will produce the new state).
  setState(
    updater: (s: LexicalEditorState) => LexicalEditorState | void,
  ) {
    this.mirror.setState((rootState: any) => {
      const currentEditor = rootState?.editorState || {};

      const producedEditor = produce(currentEditor, (draft: any) => {
        const result = updater(draft as LexicalEditorState);
        // If updater returns a value, produce will use that value as the next state
        if (result !== undefined) {
          return result;
        }
        // otherwise assume draft was mutated in-place
      });

      // Normalize document fields to plain primitive values expected by the schema
      const existingDoc = rootState?.document || {};
      const lastSaved = Number(existingDoc?.lastSaved) || Date.now();
      const source = existingDoc?.source || 'LexicalModel';
      const version = existingDoc?.version || '0.34.0';

      // Return a new root with updated editorState and normalized document
      return { ...rootState, editorState: producedEditor, document: { lastSaved, source, version } };
    });
  }

  onChange(cb: ChangeCallback) {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  addBlock(parentPath: number[], block: LexicalNode) {
    this.setState((s) => {
      let parent: any = s.root;
      for (const idx of parentPath) {
        parent = parent.children[idx];
      }
      if (!parent.children) parent.children = [];
      parent.children.push(block as any);
      // mutated draft; no return required
    });
  }

  // Insert block at specific position
  insertBlockAt(parentPath: number[], position: number, block: LexicalNode) {
    this.setState((s) => {
      let parent: any = s.root;
      for (const idx of parentPath) {
        parent = parent.children[idx];
      }
      if (!parent.children) parent.children = [];
      
      // Ensure position is within bounds
      const insertPos = Math.max(0, Math.min(position, parent.children.length));
      parent.children.splice(insertPos, 0, block as any);
    });
  }

  // Update block at specific position
  updateBlockAt(parentPath: number[], position: number, block: LexicalNode) {
    this.setState((s) => {
      let parent: any = s.root;
      for (const idx of parentPath) {
        parent = parent.children[idx];
      }
      if (parent.children && position >= 0 && position < parent.children.length) {
        parent.children[position] = block as any;
      }
    });
  }

  removeBlock(path: number[]) {
    let removed: any = undefined;
    this.setState((s) => {
      let parent: any = s.root;
      for (const idx of path.slice(0, -1)) parent = parent.children[idx];
      removed = parent.children.splice(path[path.length - 1], 1)[0];
    });
    return removed;
  }

  // High-level helpers
  addParagraph(parentPath: number[], text = '') {
    const node: LexicalNode = { type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text } as any] } as any;
    this.addBlock(parentPath, node);
    return node;
  }

  addHeading(parentPath: number[], text = '', tag: 'h1' | 'h2' | 'h3' = 'h1') {
    const node: LexicalNode = { type: 'heading', version: 1, tag, children: [{ type: 'text', version: 1, text } as any] } as any;
    this.addBlock(parentPath, node);
    return node;
  }

  addCodeBlock(parentPath: number[], code = '', language = 'text') {
    const node: LexicalNode = { type: 'code', version: 1, language, children: [{ type: 'text', version: 1, text: code } as any] } as any;
    this.addBlock(parentPath, node);
    return node;
  }

  addList(parentPath: number[], items: string[] = [], listType: 'bullet' | 'number' = 'bullet') {
    const children = items.map((it) => ({ type: 'listitem', version: 1, children: [{ type: 'text', version: 1, text: it }] } as any));
    const node: LexicalNode = { type: 'list', version: 1, listType, start: 1, tag: listType === 'bullet' ? 'ul' : 'ol', children } as any;
    this.addBlock(parentPath, node);
    return node;
  }
}

export default LexicalModel;
