import type {LexicalEditor} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc, LoroTree} from 'loro-crdt';
import invariant from '../utils/invariant';
import type {Cursor} from './sync/SyncCursors';
import { createLoroTree } from './utils/Utils';
import { NodeMapper, initializeNodeMapper } from './nodes/NodesMapper';
import {Provider} from './State';

export type ClientID = number;

export type Binding = {
  tree: LoroTree;
  clientID: ClientID;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  excludedProperties: ExcludedProperties;
  nodeMapper: NodeMapper;
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
  
  const binding: Binding = {
//    clientID: doc.peerId,
    clientID: Number(doc.peerIdStr.slice(0, 8)), // Convert Loro peer ID to number
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    tree: createLoroTree(doc),
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    nodeMapper: null as any, // Will be initialized below
  };

  // Initialize the NodeMapper with the binding
  binding.nodeMapper = initializeNodeMapper(binding);  

  // Setup global debugging for Loro
  (window as any).debugLoro = {
    binding: null,  // Will be set after binding is created
    logStructure: () => {
      const binding = (window as any).debugLoro.binding as Binding;
      if (binding) {
        console.log('=== LORO TREE STRUCTURE DEBUG ===');
        const tree = binding.tree;
        const nodes = tree.nodes();
        console.log(`Total nodes in tree: ${nodes.length}`);
        
        // Helper function to recursively log tree structure
        const logTreeStructure = (node: any, prefix: string = '', isLast: boolean = true, depth: number = 0) => {
          const data = Object.fromEntries(node.data.entries());
          const treeId = node.id;
          const lexicalKey = data.lexicalKey || 'no-key';
          const elementType = data.elementType || 'no-type';
          
          const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
          const nodeInfo = `TreeID(${treeId.slice(0, 8)}...) → ${lexicalKey} [${elementType}]`;
          
          console.log(`${prefix}${connector}${nodeInfo}`);
          
          const children = node.children();
          if (children && children.length > 0) {
            children.forEach((child: any, index: number) => {
              const isLastChild = index === children.length - 1;
              const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '    ' : '│   '));
              logTreeStructure(child, childPrefix, isLastChild, depth + 1);
            });
          }
        };
        
        // Find and display all root nodes
        const rootNodes = nodes.filter((node: any) => {
          const parent = node.parent();
          const data = Object.fromEntries(node.data.entries());
          return !parent || data.isRoot;
        });
        
        console.log(`Root nodes: ${rootNodes.length}`);
        console.log('');
        
        if (rootNodes.length === 0) {
          console.log('⚠️  No root nodes found!');
        } else {
          rootNodes.forEach((root, index) => {
            const isLastRoot = index === rootNodes.length - 1;
            logTreeStructure(root, '', isLastRoot, 0);
          });
        }
        console.log('=== END LORO DEBUG ===');
      } else {
        console.log('Loro binding not available yet');
      }
    },
    verifyStructure: () => {
      const binding = (window as any).debugLoro.binding as Binding;
      if (!binding) return console.log('❌ Loro Binding not available');
      
      console.log('🔍 LORO TREE VERIFICATION:');
      const tree = binding.tree;
      const nodes = tree.nodes();
      
      console.log('Total nodes:', nodes.length);
      console.log('Peer ID:', binding.doc.peerIdStr);
      console.log('Client ID:', binding.clientID);
      
      // Check mapping consistency
      const mapper = binding.nodeMapper;
      console.log('\n📍 Node Mappings:');
      
      nodes.forEach((node, index) => {
        const data = Object.fromEntries(node.data.entries());
        const lexicalKey = data.lexicalKey;
        const treeId = node.id;
        
        console.log(`\n📍 Node ${index}:`);
        console.log('  TreeID:', treeId);
        console.log('  Lexical Key:', lexicalKey);
        console.log('  Element Type:', data.elementType || 'N/A');
        console.log('  Created At:', data.createdAt && typeof data.createdAt === 'number' ? new Date(data.createdAt).toLocaleTimeString() : 'N/A');
        console.log('  Has Lexical Data:', data.lexical ? 'Yes' : 'No');
        const parent = node.parent();
        console.log('  Parent:', parent ? parent.id : 'None (Root)');
        const children = node.children();
        console.log('  Children Count:', children ? children.length : 0);
        
        if (data.lexical && typeof data.lexical === 'string') {
          try {
            const parsed = JSON.parse(data.lexical);
            console.log('  Lexical Type:', parsed.lexicalNode?.type || 'Unknown');
          } catch (e) {
            console.log('  Lexical Data: Invalid JSON');
          }
        }
      });
      
      // Check for orphaned nodes
      const orphanedNodes = nodes.filter(node => {
        const parent = node.parent();
        const data = Object.fromEntries(node.data.entries());
        return !parent && !data.isRoot;
      });
      if (orphanedNodes.length > 0) {
        console.log('\n⚠️  WARNING: Found orphaned nodes (no parent, not root):');
        orphanedNodes.forEach(node => {
          const data = Object.fromEntries(node.data.entries());
          console.log(`   - ${node.id} (${data.lexicalKey}, ${data.elementType})`);
        });
      }
      
      // Show parent-child relationships
      console.log('\n🌳 Parent-Child Relationships:');
      nodes.forEach(node => {
        const data = Object.fromEntries(node.data.entries());
        const parent = node.parent();
        const children = node.children();
        console.log(`${node.id} (${data.lexicalKey || 'no-key'}, ${data.elementType || 'no-type'})`);
        console.log(`   Parent: ${parent ? parent.id : 'None'}`);
        console.log(`   Children: ${children ? children.map(child => child.id).join(', ') : 'None'}`);
      });
    },
    inspectNode: (treeId: string) => {
      const binding = (window as any).debugLoro.binding as Binding;
      if (!binding) return console.log('Loro binding not available');
      
      const tree = binding.tree;
      // Cast treeId to TreeID type - in practice this should work if it's a valid ID
      const node = tree.getNodeByID(treeId as any);
      
      if (node) {
        const data = Object.fromEntries(node.data.entries());
        const parent = node.parent();
        const children = node.children();
        
        console.log('🔍 Loro Node Details:', {
          treeId: node.id,
          lexicalKey: data.lexicalKey,
          elementType: data.elementType,
          createdAt: data.createdAt && typeof data.createdAt === 'number' ? new Date(data.createdAt).toLocaleString() : 'N/A',
          hasLexicalData: !!data.lexical,
          parent: parent ? parent.id : 'None (Root)',
          childrenCount: children ? children.length : 0,
          isRoot: data.isRoot || false
        });
        
        if (data.lexical && typeof data.lexical === 'string') {
          try {
            const lexicalData = JSON.parse(data.lexical);
            console.log('📄 Lexical Data:', lexicalData);
          } catch (e) {
            console.log('❌ Failed to parse lexical data:', e);
          }
        }
      } else {
        console.warn(`Node with TreeID "${treeId}" not found`);
      }
    },
    generateTreeHTML: (nodes: any[], rootNode?: any, prefix: string = '', isLast: boolean = true, depth: number = 0) => {
      if (!rootNode) {
        // Find root nodes
        const rootNodes = nodes.filter(node => {
          const parent = node.parent();
          const data = Object.fromEntries(node.data.entries());
          return !parent || data.isRoot;
        });
        if (rootNodes.length === 0) return '<div style="color: #ffaa00;">No root nodes found</div>';
        
        // Display all root nodes
        let result = '';
        rootNodes.forEach((root, index) => {
          const isLastRoot = index === rootNodes.length - 1;
          result += (window as any).debugLoro.generateTreeHTML(nodes, root, '', isLastRoot, 0);
        });
        return result;
      }
      
      const data = Object.fromEntries(rootNode.data.entries());
      const treeId = rootNode.id;
      const lexicalKey = data.lexicalKey || 'no-key';
      const elementType = data.elementType || 'no-type';
      const nodeInfo = `TreeID(${treeId.slice(0, 8)}...) → ${lexicalKey} [${elementType}]`;
      
      const clickHandler = `onclick="window.debugLoro.inspectNode('${treeId}')"`;
      const nodeColor = data.isRoot ? '#00ff88' : '#00ffaa';
      const cursor = 'cursor: pointer; text-decoration: underline;';
      
      // Create proper tree structure with indentation
      const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
      let result = `<div style="color: ${nodeColor}; ${cursor}" ${clickHandler}>${prefix}${connector}${nodeInfo}</div>`;
      
      const children = rootNode.children();
      if (children && children.length > 0) {
        children.forEach((child: any, index: number) => {
          const isLastChild = index === children.length - 1;
          // Calculate prefix for children - if current node is last, use spaces, otherwise use vertical line
          const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '    ' : '│   '));
          result += (window as any).debugLoro.generateTreeHTML(nodes, child, childPrefix, isLastChild, depth + 1);
        });
      }
      
      return result;
    },
    addDebugToPage: () => {
      const binding = (window as any).debugLoro.binding as Binding;
      if (!binding) return;
      
      const tree = binding.tree;
      const nodes = tree.nodes();
      
      // Debug: log the actual structure to console as a tree
      console.log('🟢 LORO Tree structure:');
      console.log(`  Total nodes: ${nodes.length}`);
      console.log(`  Peer ID: ${binding.doc.peerIdStr}`);
      console.log(`  Client ID: ${binding.clientID}`);
      console.log('');
      
      // Helper function to recursively log tree structure
      const logTreeStructure = (node: any, prefix: string = '', isLast: boolean = true, depth: number = 0) => {
        const data = Object.fromEntries(node.data.entries());
        const treeId = node.id;
        const lexicalKey = data.lexicalKey || 'no-key';
        const elementType = data.elementType || 'no-type';
        
        const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
        const nodeInfo = `TreeID(${treeId.slice(0, 8)}...) → ${lexicalKey} [${elementType}]`;
        
        console.log(`${prefix}${connector}${nodeInfo}`);
        
        const children = node.children();
        if (children && children.length > 0) {
          children.forEach((child: any, index: number) => {
            const isLastChild = index === children.length - 1;
            const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '    ' : '│   '));
            logTreeStructure(child, childPrefix, isLastChild, depth + 1);
          });
        }
      };
      
      // Find and display all root nodes
      const rootNodes = nodes.filter((node: any) => {
        const parent = node.parent();
        const data = Object.fromEntries(node.data.entries());
        return !parent || data.isRoot;
      });
      
      if (rootNodes.length === 0) {
        console.log('  ⚠️  No root nodes found!');
      } else {
        rootNodes.forEach((root, index) => {
          const isLastRoot = index === rootNodes.length - 1;
          logTreeStructure(root, '', isLastRoot, 0);
        });
      }

      console.log('🟢 Lexical State:', {
        state: binding.editor.getEditorState().toJSON(),
      });
      
      const treeHTML = (window as any).debugLoro.generateTreeHTML(nodes);
      
      const debugDiv = document.getElementById('debug-loro') || document.createElement('div');
      debugDiv.id = 'debug-loro';
      debugDiv.style.cssText = 'position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.95); color: #00ff00; padding: 15px; border-radius: 8px; font-family: "Courier New", monospace; font-size: 11px; z-index: 9999; max-width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 8px rgba(0,0,0,0.5); border: 1px solid #00ff00;';
      debugDiv.innerHTML = `
        <div style="color: #00ff88; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">🟢 LORO TREE (v1)</div>
        <div style="color: #00ffaa; margin-bottom: 8px;">Total nodes: ${nodes.length}</div>
        <div style="color: #00ff66; margin-bottom: 8px;">Peer ID: ${binding.doc.peerIdStr.slice(0, 8)}...</div>
        <div style="color: #00ffdd; margin-bottom: 10px;">Time: ${new Date().toLocaleTimeString()}</div>
        <div style="border-top: 1px solid #444; padding-top: 8px; line-height: 1.4; font-family: 'Courier New', monospace;">
          ${treeHTML}
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #666;">
          <span onclick="window.debugLoro.addDebugToPage()" style="color: #00ffaa; cursor: pointer; text-decoration: underline;">🔄 Refresh</span> | 
          <span onclick="window.debugLoro.verifyStructure()" style="color: #00ff66; cursor: pointer; text-decoration: underline;">✅ Verify</span> | 
          <span onclick="window.debugLoro.logStructure()" style="color: #00ffdd; cursor: pointer; text-decoration: underline;">📝 Console Log</span> |
          <span onclick="document.getElementById('debug-loro').remove()" style="color: #ff0066; cursor: pointer; text-decoration: underline;">❌ Close</span>
        </div>
      `;
      document.body.appendChild(debugDiv);
    }
  };

  // Expose binding for debugging
  (window as any).debugLoro.binding = binding;

  // Auto-initialize debug window after a short delay
  setTimeout(() => {
    (window as any).debugLoro.addDebugToPage();
  }, 2000); // Slightly later than Y.js to avoid overlap

  return binding;
}
