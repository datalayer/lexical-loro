import type {Doc} from 'yjs';
import {XmlText} from 'yjs';
import type {LexicalEditor, NodeKey} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import invariant from '../utils/invariant';
import type {CollabElementNode} from './nodes/CollabElementNode';
import {$createCollabElementNode} from './nodes/CollabElementNode';
import { AnyCollabNode } from './nodes/AnyCollabNode';
import type {Cursor} from './sync/SyncCursors';
import {Provider} from './State';

export type ClientID = number;

export type Binding = {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, AnyCollabNode>;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: Doc;
  docMap: Map<string, Doc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  root: CollabElementNode;
  excludedProperties: ExcludedProperties;
};

export type ExcludedProperties = Map<Klass<LexicalNode>, Set<string>>;

export function createBinding(
  editor: LexicalEditor,
  provider: Provider,
  id: string,
  doc: Doc | null | undefined,
  docMap: Map<string, Doc>,
  excludedProperties?: ExcludedProperties,
): Binding {

  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );

  const rootXmlText = doc.get('root', XmlText) as XmlText;

  const collabRoot: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  collabRoot._key = 'root';

  // Setup global debugging for Y.js
  (window as any).debugYjs = {
    binding: null,  // Will be set after binding is created
    logStructure: () => {
      const binding = (window as any).debugYjs.binding;
      if (binding) {
        console.log('=== YJS STRUCTURE DEBUG ===');
        console.log('Root children:', binding.root._children.length);
        binding.root._children.forEach((child: any, index: number) => {
          console.log(`  ${index}: ${child.constructor.name}(${child._key})`);
        });
        console.log('=== END DEBUG ===');
      } else {
        console.log('Y.js binding not available yet');
      }
    },
    addDebugToPage: () => {
      const binding = (window as any).debugYjs.binding;
      if (!binding) return;
      
      const debugDiv = document.getElementById('debug-yjs') || document.createElement('div');
      debugDiv.id = 'debug-yjs';
      debugDiv.style.cssText = 'position: fixed; top: 10px; left: 10px; background: rgba(0,100,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 9999; max-width: 400px;';
      debugDiv.innerHTML = `
        <div><strong>YJS DEBUG</strong></div>
        <div>Root children: ${binding.root._children.length}</div>
        <div>Children: ${binding.root._children.map((c: any) => c.constructor.name).join(', ')}</div>
        <div>Time: ${new Date().toLocaleTimeString()}</div>
      `;
      document.body.appendChild(debugDiv);
    }
  };

  const binding = {
    clientID: doc.clientID,
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    root: collabRoot,
  };

  // Expose binding for debugging
  (window as any).debugYjs.binding = binding;

  return binding
}
