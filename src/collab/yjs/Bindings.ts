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
    verifyStructure: () => {
      const binding = (window as any).debugYjs.binding;
      if (!binding) return console.log('❌ Binding not available');
      
      console.log('🔍 YJS STRUCTURE VERIFICATION:');
      console.log('Root children count:', binding.root._children.length);
      
      binding.root._children.forEach((child, index) => {
        console.log(`\n📍 Root child ${index}:`);
        console.log('  Type:', child.constructor.name);
        console.log('  Key:', child._key);
        console.log('  Element Type:', child.getType ? child.getType() : 'N/A');
        console.log('  Children Count:', child._children ? child._children.length : 0);
        
        if (child._children && child._children.length > 0) {
          console.log('  Children:');
          child._children.forEach((grandChild, gIndex) => {
            console.log(`    ${gIndex}: ${grandChild.constructor.name}(${grandChild._key})`);
          });
        }
      });
      
      // Check for any orphaned text nodes at root level
      const textNodesAtRoot = binding.root._children.filter(child => child.constructor.name === 'CollabTextNode');
      if (textNodesAtRoot.length > 0) {
        console.log('⚠️  WARNING: Found text nodes directly under root:');
        textNodesAtRoot.forEach(node => console.log('   -', node._key));
      }
    },
    inspectNode: (nodeKey: string) => {
      const binding = (window as any).debugYjs.binding;
      if (!binding) return console.log('Binding not available');
      
      // Search for node in tree
      const findNode = (node: any, key: string): any => {
        if (node._key === key) return node;
        if (node._children) {
          for (let child of node._children) {
            const found = findNode(child, key);
            if (found) return found;
          }
        }
        return null;
      };
      
      const node = findNode(binding.root, nodeKey);
      if (node) {
        console.log('🔍 Node Details:', {
          key: node._key,
          type: node.constructor.name,
          elementType: node.getType ? node.getType() : 'N/A',
          children: node._children ? node._children.length : 0,
          properties: node._xmlText ? 'Has XmlText' : 'No XmlText',
          parent: node._parent ? node._parent._key : 'No parent'
        });
      } else {
        console.log(`Node with key "${nodeKey}" not found`);
      }
    },
    generateTreeHTML: (node: any, prefix = '', isLast = true) => {
      const nodeKey = node._key || 'no-key';
      const nodeType = node.getType ? node.getType() : 'no-type';
      const nodeInfo = `${node.constructor.name}(${nodeKey}) [${nodeType}]`;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      
      const clickHandler = nodeKey !== 'no-key' ? `onclick="window.debugYjs.inspectNode('${nodeKey}')"` : '';
      const nodeColor = nodeKey !== 'no-key' ? '#00ff88' : '#888';
      const cursor = nodeKey !== 'no-key' ? 'cursor: pointer; text-decoration: underline;' : '';
      
      // Convert spaces to non-breaking spaces for proper HTML rendering
      const htmlPrefix = prefix.replace(/ /g, '&nbsp;');
      const htmlConnector = connector.replace(/ /g, '&nbsp;');
      
      let result = `<div style="color: ${nodeColor}; ${cursor}" ${clickHandler}>${htmlPrefix}${htmlConnector}${nodeInfo}</div>`;
      
      if (node._children && node._children.length > 0) {
        node._children.forEach((child: any, index: number) => {
          const isLastChild = index === node._children.length - 1;
          if (child) {
            result += (window as any).debugYjs.generateTreeHTML(child, childPrefix, isLastChild);
          } else {
            const childConnector = isLastChild ? '└── ' : '├── ';
            const htmlChildPrefix = childPrefix.replace(/ /g, '&nbsp;');
            const htmlChildConnector = childConnector.replace(/ /g, '&nbsp;');
            result += `<div style="color: #ffaa00;">${htmlChildPrefix}${htmlChildConnector}null</div>`;
          }
        });
      }
      
      return result;
    },
    addDebugToPage: () => {
      const binding = (window as any).debugYjs.binding;
      if (!binding) return;
      
      // Debug: log the actual structure to console
      console.log('🟢 YJS Root structure verification:', {
        rootChildren: binding.root._children.length,
        children: binding.root._children.map((child: any, index: number) => ({
          index,
          type: child.constructor.name,
          key: child._key,
          childrenCount: child._children ? child._children.length : 0,
          children: child._children ? child._children.map((grandChild: any) => ({
            type: grandChild.constructor.name,
            key: grandChild._key
          })) : []
        }))
      });
      
      const treeHTML = (window as any).debugYjs.generateTreeHTML(binding.root);
      
      
      const debugDiv = document.getElementById('debug-yjs') || document.createElement('div');
      debugDiv.id = 'debug-yjs';
      debugDiv.style.cssText = 'position: fixed; top: 10px; left: 10px; background: rgba(0,100,0,0.9); color: white; padding: 15px; border-radius: 8px; font-family: "Courier New", monospace; font-size: 11px; z-index: 9999; max-width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 8px rgba(0,0,0,0.3);';
      debugDiv.innerHTML = `
        <div style="color: #51cf66; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;">🟢 YJS STRUCTURE (v2)</div>
        <div style="color: #74c0fc; margin-bottom: 8px;">Root children: ${binding.root._children.length}</div>
        <div style="color: #ffd43b; margin-bottom: 10px;">Time: ${new Date().toLocaleTimeString()}</div>
        <div style="border-top: 1px solid #444; padding-top: 8px;">
          ${treeHTML}
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #888;">
          <span onclick="window.debugYjs.addDebugToPage()" style="color: #74c0fc; cursor: pointer; text-decoration: underline;">🔄 Refresh</span> | 
          <span onclick="window.debugYjs.verifyStructure()" style="color: #00ff88; cursor: pointer; text-decoration: underline;">✅ Verify</span> | 
          <span onclick="window.debugYjs.logStructure()" style="color: #ffd43b; cursor: pointer; text-decoration: underline;">📝 Console Log</span> |
          <span onclick="document.getElementById('debug-yjs').remove()" style="color: #51cf66; cursor: pointer; text-decoration: underline;">❌ Close</span>
        </div>
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
