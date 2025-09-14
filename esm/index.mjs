import {registerDragonSupport} from '@lexical/dragon';
import {createEmptyHistoryState, registerHistory} from '@lexical/history';
import {HeadingNode, QuoteNode, registerRichText} from '@lexical/rich-text';
import {mergeRegister} from '@lexical/utils';
import {createEditor, HISTORY_MERGE_TAG} from 'lexical';

import prepopulatedRichText from './prepopulatedRichText.mjs';

const editorRef = document.getElementById('lexical-editor');
const stateRef = document.getElementById('lexical-state');

const initialConfig = {
  namespace: 'Vanilla JS Demo',
  // Register nodes specific for @lexical/rich-text
  nodes: [HeadingNode, QuoteNode],
  onError: (error) => {
    throw error;
  },
  theme: {
    // Adding styling to Quote node, see styles.css
    quote: 'PlaygroundEditorTheme__quote',
  },
};
const editor = createEditor(initialConfig);
editor.setRootElement(editorRef);

// Registering Plugins
mergeRegister(
  registerRichText(editor),
  registerDragonSupport(editor),
  registerHistory(editor, createEmptyHistoryState(), 300),
);

editor.update(prepopulatedRichText, {tag: HISTORY_MERGE_TAG});

editor.registerUpdateListener(({editorState}) => {
  stateRef.value = JSON.stringify(editorState.toJSON(), undefined, 2);
});
