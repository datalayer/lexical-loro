import type {LexicalEditor} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc, LoroTree} from 'loro-crdt';
import invariant from '../utils/invariant';
import type {CollabCursor} from './sync/SyncCursors';
import { getLoroTree } from './utils/Utils';
import { NodeMapper, initializeNodeMapper } from './nodes/NodesMapper';
import {Provider} from './State';


export type ClientID = number;

export type Binding = {
  tree: LoroTree;
  clientID: ClientID;
  cursors: Map<ClientID, CollabCursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  excludedProperties: ExcludedProperties;
  nodeMapper: NodeMapper;
  // Async commit properties
  commitTimeout?: NodeJS.Timeout | null;
  pendingCommit?: boolean;
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
  
  // Initialize the tree - content will come from server snapshot via sync
  const tree = getLoroTree(doc);
  console.log('📄 Loro tree initialized, content will be populated via server sync');
  
  const binding: Binding = {
//    clientID: doc.peerId,
    clientID: Number(doc.peerIdStr.slice(0, 8)), // Convert Loro peer ID to number
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    tree,
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    nodeMapper: null as any, // Will be initialized below
    // Initialize async commit properties
    commitTimeout: null,
    pendingCommit: false,
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
          // Get lexical key from mapper instead of node data
          const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(treeId) || 'no-key';
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
        const treeId = node.id;
        // Get lexical key from mapper instead of node data
        const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(treeId) || 'no-key';
        
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
          const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(node.id) || 'no-key';
          console.log(`   - ${node.id} (${lexicalKey}, ${data.elementType})`);
        });
      }
      
      // Show parent-child relationships
      console.log('\n🌳 Parent-Child Relationships:');
      nodes.forEach(node => {
        const data = Object.fromEntries(node.data.entries());
        const parent = node.parent();
        const children = node.children();
        const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(node.id) || 'no-key';
        console.log(`${node.id} (${lexicalKey}, ${data.elementType || 'no-type'})`);
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
        
        // Collect lexical properties (new individual property format)
        const lexicalProps: Record<string, any> = {};
        Object.entries(data).forEach(([key, value]) => {
          if (key.startsWith('lexical_')) {
            lexicalProps[key.substring(8)] = value; // Remove 'lexical_' prefix
          }
        });
        
        // Get lexical key from mapper instead of node data
        const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(node.id) || 'no-key';
        
        console.log('🔍 Loro Node Details:', {
          treeId: node.id,
          lexicalKey: lexicalKey,
          elementType: data.elementType,
          createdAt: data.createdAt && typeof data.createdAt === 'number' ? new Date(data.createdAt).toLocaleString() : 'N/A',
          hasLexicalData: Object.keys(lexicalProps).length > 0 || !!data.lexical,
          parent: parent ? parent.id : 'None (Root)',
          childrenCount: children ? children.length : 0,
          isRoot: data.isRoot || false
        });
        
        // Handle different lexical data formats
        if (Object.keys(lexicalProps).length > 0) {
          console.log('📄 Lexical Data (Individual Properties):', lexicalProps);
        } else if (data.lexical) {
          if (typeof data.lexical === 'object') {
            console.log('📄 Lexical Data (Current JSON Object):', data.lexical);
          } else if (typeof data.lexical === 'string') {
            try {
              const lexicalData = JSON.parse(data.lexical);
              console.log('📄 Lexical Data (Legacy JSON String):', lexicalData);
            } catch (e) {
              console.log('❌ Failed to parse lexical data:', e);
            }
          }
        } else {
          console.log('⚠️ No lexical data found for this node');
        }
        
        // Fetch and log the corresponding lexical node
        if (lexicalKey && lexicalKey !== 'no-key' && typeof lexicalKey === 'string') {
          try {
            const editorState = binding.editor.getEditorState();
            const nodeInfo = editorState.read(() => {
              const lexicalNode = editorState._nodeMap.get(lexicalKey as string);
              
              if (!lexicalNode) {
                return null;
              }
              
              const info: any = {
                key: lexicalNode.getKey(),
                type: lexicalNode.getType(),
                parent: lexicalNode.getParent()?.getKey() || 'None (Root)',
                textContent: lexicalNode.getTextContent ? lexicalNode.getTextContent() : 'N/A',
                serialized: lexicalNode.exportJSON()
              };
              
              // Add children info if it's an ElementNode
              if ('getChildren' in lexicalNode && typeof lexicalNode.getChildren === 'function') {
                info.children = (lexicalNode as any).getChildren().map((child: any) => child.getKey());
              } else {
                info.children = 'N/A (Not an ElementNode)';
              }
              
              return info;
            });
            
            if (nodeInfo) {
              console.log('🔗 Linked Lexical Node:', nodeInfo);
            } else {
              console.log('⚠️ No lexical node found in editor state for key:', lexicalKey, '(node may have been deleted or not yet created)');
            }
          } catch (e) {
            console.log('❌ Failed to fetch lexical node:', e);
          }
        } else {
          console.log('⚠️ No valid lexical key found for this Loro node (key:', lexicalKey, ')');
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
      // Get lexical key from mapper instead of node data
      const binding = (window as any).debugLoro.binding as Binding;
      const lexicalKey = binding?.nodeMapper?.getLexicalKeyByLoroId(treeId) || 'no-key';
      const elementType = data.elementType || 'no-type';
      const nodeInfo = `TreeID(${treeId.slice(0, 8)}...) → ${lexicalKey} [${elementType}]`;
      
      const clickIntegrator = `onclick="window.debugLoro.inspectNode('${treeId}')"`;
      const nodeColor = data.isRoot ? '#00ff88' : '#00ffaa';
      const cursor = 'cursor: pointer; text-decoration: underline;';
      
      // Create proper tree structure with indentation
      const connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
      let result = `<div style="color: ${nodeColor}; ${cursor}" ${clickIntegrator}>${prefix}${connector}${nodeInfo}</div>`;
      
      const children = rootNode.children();
      if (children && children.length > 0) {
        children.forEach((child: any, index: number) => {
          const isLastChild = index === children.length - 1;
          // Calculate prefix for children - if current node is last, use spaces, otherwise use vertical line
          // Use &nbsp; for HTML spaces to ensure proper rendering
          const childPrefix = prefix + (depth === 0 ? '' : (isLast ? '&nbsp;&nbsp;&nbsp;&nbsp;' : '│&nbsp;&nbsp;&nbsp;'));
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
        // Get lexical key from mapper instead of node data
        const lexicalKey = binding.nodeMapper?.getLexicalKeyByLoroId(treeId) || 'no-key';
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

      console.log('🟢 Loro Tree:', tree.toJSON());
      
      console.log('🟢 Lexical State:', binding.editor.getEditorState().toJSON());
      
      const treeHTML = (window as any).debugLoro.generateTreeHTML(nodes);
      
      const debugDiv = document.getElementById('debug-loro') || document.createElement('div');
      const existingDiv = document.getElementById('debug-loro');
      
      // Preserve current position if panel already exists
      let currentLeft = '10px';
      let currentTop = '700px';
      if (existingDiv) {
        currentLeft = existingDiv.style.left || '10px';
        currentTop = existingDiv.style.top || '10px';
      }
      
      debugDiv.id = 'debug-loro';
      debugDiv.style.cssText = `position: fixed; top: ${currentTop}; left: ${currentLeft}; background: rgba(0,0,0,0.95); color: #00ff00; padding: 0; border-radius: 8px; font-family: "Courier New", monospace; font-size: 11px; z-index: 9999; max-width: 500px; max-height: 80vh; box-shadow: 0 4px 8px rgba(0,0,0,0.5); border: 1px solid #00ff00; user-select: none;`;
      
      // Add drag functionality if not already added
      if (!debugDiv.classList.contains('draggable-initialized')) {
        debugDiv.classList.add('draggable-initialized');
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        
        debugDiv.addEventListener('mousedown', (e: MouseEvent) => {
          // Only start drag if clicking on the header area
          const target = e.target as HTMLElement;
          const dragHandle = debugDiv.querySelector('.debug-drag-integrate') as HTMLElement;
          if (!dragHandle || !dragHandle.contains(target)) return;
          
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          const rect = debugDiv.getBoundingClientRect();
          startLeft = rect.left;
          startTop = rect.top;
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          e.preventDefault();
        });
        
        function onMouseMove(e: MouseEvent) {
          if (!isDragging) return;
          
          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          const newLeft = Math.max(0, Math.min(window.innerWidth - debugDiv.offsetWidth, startLeft + deltaX));
          const newTop = Math.max(0, Math.min(window.innerHeight - debugDiv.offsetHeight, startTop + deltaY));
          
          debugDiv.style.left = newLeft + 'px';
          debugDiv.style.top = newTop + 'px';
        }
        
        function onMouseUp() {
          isDragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
      }
      
      debugDiv.innerHTML = `
        <div class="debug-drag-integrate" style="color: #00ff88; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #00ff00; padding: 15px 15px 5px 15px; cursor: move; background: linear-gradient(90deg, rgba(0,255,136,0.1), transparent);">
          🟢 LORO TREE <span style="float: right; font-size: 9px; color: #666;">⋮⋮ drag</span>
        </div>
        <div style="padding: 0 15px 15px 15px; overflow-y: auto; max-height: calc(80vh - 50px);">
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

/**
 * Schedules an asynchronous commit for the binding to reduce latency with large documents.
 * Uses debouncing to prevent excessive commits during rapid mutations.
 * 
 * @param binding - The binding to commit
 * @param delay - Debounce delay in milliseconds (default: 100ms)
 */
export function scheduleAsyncCommit(binding: Binding, delay: number = 500): void {
  // Clear any existing timeout
  if (binding.commitTimeout) {
    clearTimeout(binding.commitTimeout);
  }
  
  // Mark that we have pending changes
  binding.pendingCommit = true;
  
  // Schedule the commit after the specified delay
  binding.commitTimeout = setTimeout(() => {
    if (binding.pendingCommit) {
      try {
        // Perform the actual commit
        binding.doc.commit({ origin: binding.doc.peerIdStr });
        console.log('🔄 Async commit completed for binding:', binding.id);
      } catch (error) {
        console.error('❌ Async commit failed for binding:', binding.id, error);
      }
      
      // Reset pending state
      binding.pendingCommit = false;
    }
    binding.commitTimeout = null;
  }, delay);
}

/**
 * Forces an immediate commit if there are pending changes.
 * Useful for ensuring changes are committed before important operations.
 * 
 * @param binding - The binding to commit
 */
export function flushPendingCommit(binding: Binding): void {
  if (binding.commitTimeout) {
    clearTimeout(binding.commitTimeout);
    binding.commitTimeout = null;
  }
  
  if (binding.pendingCommit) {
    binding.doc.commit({ origin: binding.doc.peerIdStr });
    binding.pendingCommit = false;
    console.log('🔄 Forced commit completed for binding:', binding.id);
  }
}
