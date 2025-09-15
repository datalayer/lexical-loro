import type {LexicalEditor, NodeKey} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc} from 'loro-crdt';
import type {CollabElementNode} from './nodes/CollabElementNode';
import {$createCollabElementNode} from './nodes/CollabElementNode';
import { AnyCollabNode } from './nodes/AnyCollabNode';
import invariant from '../utils/invariant';
import type {Cursor} from './sync/SyncCursors';
import {XmlText} from './types/XmlText';
import {Provider} from './State';

export type ClientID = number;

export type Binding = {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, AnyCollabNode>;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
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
  doc: LoroDoc | null | undefined,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: ExcludedProperties,
): Binding {

  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );
  
  const rootXmlText = new XmlText(doc, 'root');
  rootXmlText.setAttribute('__type', 'root');
  
  const collabRoot: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  collabRoot._key = 'root';
  
  console.log(`🔧 [BINDING-INIT] Created root CollabElementNode with key: ${collabRoot._key}`);
  
  // Add debug method to inspect hierarchy
  (collabRoot as any).logHierarchy = function(prefix = "") {
    console.log(`${prefix}${this.constructor.name}(${this._key}) [${this.getType()}] - ${this._children.length} children`);
    this._children.forEach((child, index) => {
      if (child && typeof child.logHierarchy === 'function') {
        child.logHierarchy(`${prefix}  ${index}: `);
      } else {
        console.log(`${prefix}  ${index}: ${child ? child.constructor.name : 'null'}(${child ? child._key : 'no-key'})`);
      }
    });
  };
  
  // Expose for debugging
  (window as any).debugLoro = {
    binding: null,  // Will be set after binding is created
    logStructure: () => {
      const binding = (window as any).debugLoro.binding;
      if (binding) {
        console.log('=== LORO STRUCTURE DEBUG ===');
        binding.root.logHierarchy();
        console.log('=== END DEBUG ===');
      } else {
        console.log('Binding not available yet');
      }
    },
    addDebugToPage: () => {
      const binding = (window as any).debugLoro.binding;
      if (!binding) return;
      
      const debugDiv = document.getElementById('debug-loro') || document.createElement('div');
      debugDiv.id = 'debug-loro';
      debugDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 9999; max-width: 400px;';
      debugDiv.innerHTML = `
        <div><strong>LORO DEBUG</strong></div>
        <div>Root children: ${binding.root._children.length}</div>
        <div>Children: ${binding.root._children.map((c: any) => c.constructor.name).join(', ')}</div>
        <div>Time: ${new Date().toLocaleTimeString()}</div>
      `;
      document.body.appendChild(debugDiv);
    }
  };
  
  const binding = {
//    clientID: doc.peerId,
    clientID: Number(doc.peerId.toString().slice(0, 8)), // Convert Loro peer ID to number
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
  (window as any).debugLoro.binding = binding;

  return binding;
}
