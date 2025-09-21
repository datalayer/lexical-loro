import { LoroEventBatch } from 'loro-crdt';
import { $getRoot, $getSelection, $setSelection, SKIP_COLLAB_TAG, $getNodeByKey } from 'lexical';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

// Import the new diff integrators
import { TreeIntegrator } from '../integrators/TreeIntegrator';
import { MapIntegrator } from '../integrators/MapIntegrator';
import { ListIntegrator } from '../integrators/ListIntegrator';
import { TextIntegrator } from '../integrators/TextIntegrator';
import { CounterIntegrator } from '../integrators/CounterIntegrator';

// Create singleton instances of the diff integrators (created once, reused across calls)
const treeIntegrator = new TreeIntegrator();
const mapIntegrator = new MapIntegrator();
const listIntegrator = new ListIntegrator();
const textIntegrator = new TextIntegrator();
const counterIntegrator = new CounterIntegrator();

export function syncLoroToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {
  
  console.log(`🔄 [SyncLoroToLexical] === SYNC START ===`);
  console.log(`🔄 [SyncLoroToLexical] Event batch origin:`, eventBatch.origin);
  console.log(`🔄 [SyncLoroToLexical] Number of events:`, eventBatch.events.length);
  console.log(`🔄 [SyncLoroToLexical] Events:`, eventBatch.events.map(e => ({
    type: e.diff.type,
    target: e.target?.toString(),
    path: e.path
  })));
  
  // Log full event details for debugging
  eventBatch.events.forEach((event, index) => {
    console.log(`🔄 [SyncLoroToLexical] Event ${index + 1}:`, JSON.stringify(event, null, 2));
  });

  // Batch all events into a single discrete editor.update() to avoid race conditions
  // Using discrete: true ensures immediate synchronous commit before other operations
  binding.editor.update(() => {
    
    // Clear selection temporarily to avoid cursor position conflicts during text updates
    const currentSelection = $getSelection();
    if (currentSelection) {
      $setSelection(null);
    }
    
    // Process Loro events and apply them to Lexical using the appropriate integrators
    eventBatch.events.forEach((event, index) => {
      
      // Special handling for lexical data map updates
      if (event.diff.type === 'map' && event.target && typeof event.target === 'string') {
        const targetStr = event.target.toString();
        // Handle both "lexical-" and "cid:root-lexical-" patterns
        if (targetStr.includes('lexical-') && (targetStr.startsWith('lexical-') || targetStr.includes(':root-lexical-'))) {
          console.log(`🔄 [SyncLoroToLexical] Processing lexical map update for ${targetStr}`);
          handleLexicalMapUpdate(event, binding);
          return;
        }
      }
      
      switch (event.diff.type) {
        case 'tree':
          // Call internal method that doesn't wrap in editor.update()
          treeIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        case 'map':
          // Call internal method that doesn't wrap in editor.update()
          if (event.target) {
            mapIntegrator.integrateWithContextInternal(event.diff as any, event.target, binding, provider);
          } else {
            mapIntegrator.integrateInternal(event.diff as any, binding, provider);
          }
          break;

        case 'list':
          listIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        case 'text':
          textIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        case 'counter':
          counterIntegrator.integrateInternal(event.diff as any, binding, provider);
          break;

        default:
          throw new Error(`Unsupported event diff type: ${(event.diff as any).type}. Supported types are: 'tree', 'map', 'list', 'text', 'counter'.`);
      }
    });
    
  // discrete: true
  }, { tag: SKIP_COLLAB_TAG });

  // Verify final editor state after all events
  binding.editor.getEditorState().read(() => {
    const root = $getRoot();
    const allNodes = root.getChildren().flatMap(child => {
      const nodes = [child];
      if ('getChildren' in child && typeof child.getChildren === 'function') {
        nodes.push(...(child as any).getChildren());
      }
      return nodes;
    });
    
    const textNodes = allNodes.filter(node => node.getType() === 'text');
  });

  // Sync cursor positions after applying changes
  if (!isFromUndoManger) {
    syncCursorPositionsFn(binding, provider);
  }
  
  console.log(`🔄 [SyncLoroToLexical] === SYNC COMPLETE ===`);
}

/**
 * Handle updates to separate lexical maps (lexical-${treeId})
 */
function handleLexicalMapUpdate(event: any, binding: Binding): void {
  console.log(`🔄 [SyncLoroToLexical] === LEXICAL MAP UPDATE START ===`);
  console.log(`🔄 [SyncLoroToLexical] Event:`, JSON.stringify(event, null, 2));
  
  const targetStr = event.target.toString();
  console.log(`🔄 [SyncLoroToLexical] Target string: ${targetStr}`);
  
  // Extract TreeID from lexical map name (lexical-${treeId} or cid:root-lexical-${treeId})
  let treeIdMatch = targetStr.match(/^lexical-(.+)$/);
  if (!treeIdMatch) {
    // Try the cid:root-lexical- pattern
    treeIdMatch = targetStr.match(/^cid:root-lexical-(.+?):/);
    if (!treeIdMatch) {
      console.warn(`🔄 [SyncLoroToLexical] Invalid lexical map target: ${targetStr}`);
      return;
    }
  }
  
  const treeId = treeIdMatch[1];
  console.log(`🔄 [SyncLoroToLexical] Extracted TreeID: ${treeId}`);
  
  // Find the corresponding Lexical node
  const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(treeId as any);
  console.log(`🔄 [SyncLoroToLexical] Mapped Lexical key: ${lexicalKey}`);
  
  if (!lexicalKey) {
    console.warn(`🔄 [SyncLoroToLexical] No Lexical key found for TreeID: ${treeId}`);
    console.log(`🔄 [SyncLoroToLexical] Available mappings:`, binding.nodeMapper.getAllMappings?.() || 'N/A');
    return;
  }
  
  const lexicalNode = $getNodeByKey(lexicalKey);
  console.log(`🔄 [SyncLoroToLexical] Retrieved Lexical node:`, lexicalNode ? `${lexicalNode.getType()} (${lexicalKey})` : 'null');
  
  if (!lexicalNode) {
    console.warn(`🔄 [SyncLoroToLexical] No Lexical node found for key: ${lexicalKey}`);
    return;
  }
  
  // Get the updated lexical data from the map
  console.log(`🔄 [SyncLoroToLexical] Getting lexical map for: lexical-${treeId}`);
  const lexicalMap = binding.doc.getMap(`lexical-${treeId}`);
  console.log(`🔄 [SyncLoroToLexical] Lexical map exists:`, !!lexicalMap);
  
  const lexicalData = lexicalMap.get('data') as any;
  console.log(`🔄 [SyncLoroToLexical] Raw lexical data:`, JSON.stringify(lexicalData, null, 2));
  
  if (!lexicalData) {
    console.warn(`🔄 [SyncLoroToLexical] No lexical data found in map for TreeID: ${treeId}`);
    // Also check what keys are available in the map
    try {
      const mapKeys = Object.keys(lexicalMap as any);
      console.log(`🔄 [SyncLoroToLexical] Available map keys:`, mapKeys);
    } catch (e) {
      console.log(`🔄 [SyncLoroToLexical] Could not get map keys`);
    }
    return;
  }
  
  console.log(`🔄 [SyncLoroToLexical] Applying lexical data to node ${lexicalKey}, type: ${lexicalData.type}, text: "${lexicalData.text || 'N/A'}"`);
  
  // Apply the lexical data to the node
  try {
    // For text nodes, update the text content using Lexical's proper API
    if (lexicalData.type === 'text' && lexicalNode.getType() === 'text') {
      const textNode = lexicalNode as any;
      const currentText = textNode.getTextContent();
      const newText = lexicalData.text || '';
      
      console.log(`🔄 [SyncLoroToLexical] Text comparison - Current: "${currentText}" vs New: "${newText}"`);
      
      if (currentText !== newText) {
        console.log(`🔄 [SyncLoroToLexical] Text content differs, updating...`);
        // Use Lexical's setTextContent method to properly update the text
        textNode.setTextContent(newText);
        console.log(`🔄 [SyncLoroToLexical] ✅ Updated text node ${lexicalKey} from "${currentText}" to "${newText}"`);
        
        // Force editor state update
        console.log(`🔄 [SyncLoroToLexical] Triggering editor state update`);
      } else {
        console.log(`🔄 [SyncLoroToLexical] Text content is already up to date`);
      }
    } else {
      console.log(`🔄 [SyncLoroToLexical] Not a text node or type mismatch - lexicalData.type: ${lexicalData.type}, node.type: ${lexicalNode.getType()}`);
    }
    
    // Apply other properties from lexical data
    if (typeof lexicalData === 'object') {
      Object.keys(lexicalData).forEach(key => {
        if (key !== 'type' && key !== 'text' && key !== '__parent' && key !== '__key') {
          try {
            // Use proper Lexical methods when available
            const setterMethod = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
            if (typeof (lexicalNode as any)[setterMethod] === 'function') {
              (lexicalNode as any)[setterMethod](lexicalData[key]);
            } else {
              (lexicalNode as any)[key] = lexicalData[key];
            }
          } catch (error) {
            console.warn(`🔄 [SyncLoroToLexical] Failed to set property ${key}:`, error);
          }
        }
      });
    }
    
  } catch (error) {
    console.warn(`🔄 [SyncLoroToLexical] Failed to apply lexical data to node ${lexicalKey}:`, error);
  }
  
  console.log(`🔄 [SyncLoroToLexical] === LEXICAL MAP UPDATE END ===`);
}
