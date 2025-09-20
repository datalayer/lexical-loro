import type {JSX} from 'react';
import { LexicalEditor, $getRoot, $createTextNode, $createParagraphNode } from 'lexical';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';

export default function DatalayerPlugin(): JSX.Element | null {

  const [editor] = useLexicalComposerContext();

  const reloadState = (editor: LexicalEditor) => {
    const state = editor.getEditorState();
    // JSON needs to be parsed to load an new state.
    const newEditorState = editor.parseEditorState(JSON.stringify(state));
    editor.update(() => {
//      editor.setEditorState(state);
      editor.setEditorState(newEditorState);
    });
    console.log(editor.getEditorState().toJSON());
  }

  function addParagraph(editor: LexicalEditor) {
    editor.update(() => {
      const root = $getRoot();
      const timestamp = new Date().toISOString();
      const textNode = $createTextNode(`Hello ${timestamp}`);
      const paragraphNode = $createParagraphNode();
      paragraphNode.append(textNode);
      
      // Insert the paragraph at the beginning of the editor
      const firstChild = root.getFirstChild();
      if (firstChild) {
        firstChild.insertBefore(paragraphNode);
      } else {
        root.append(paragraphNode);
      }
    });
  }

  function first100Keys(editor: LexicalEditor) {
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      const keys: string[] = [];
      
      // Get up to 100 node keys
      const maxNodes = Math.min(100, children.length);
      for (let i = 0; i < maxNodes; i++) {
        keys.push(children[i].getKey());
      }
      
      console.log(`First ${keys.length} node keys:`, keys);
    });
  }

  return (
    <>
      <button onClick={() => {reloadState(editor);}}>Reload State</button>
      <button onClick={() => {addParagraph(editor);}}>Add Paragraph</button>
      <button onClick={() => {first100Keys(editor);}}>100 First keys</button>
    </>
  );
}
