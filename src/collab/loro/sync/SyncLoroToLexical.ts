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
  
}

/**
 * Handle updates to separate lexical maps (lexical-${treeId})
 */
function handleLexicalMapUpdate(event: any, binding: Binding): void {
  
  const targetStr = event.target.toString();
  
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
  
  // Find the corresponding Lexical node
  const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(treeId as any);
  
  if (!lexicalKey) {
    console.warn(`🔄 [SyncLoroToLexical] No Lexical key found for TreeID: ${treeId}`);
    return;
  }
  
  const lexicalNode = $getNodeByKey(lexicalKey);
  
  if (!lexicalNode) {
    console.warn(`🔄 [SyncLoroToLexical] No Lexical node found for key: ${lexicalKey}`);
    return;
  }
  
  // Get the updated lexical data from the map
  const lexicalMap = binding.doc.getMap(`lexical-${treeId}`);
  
  const lexicalData = lexicalMap.get('data') as any;
  
  if (!lexicalData) {
    console.warn(`🔄 [SyncLoroToLexical] No lexical data found in map for TreeID: ${treeId}`);
    // Also check what keys are available in the map
    try {
      const mapKeys = Object.keys(lexicalMap as any);
      console.warn(`🔄 [SyncLoroToLexical] Available map keys:`, mapKeys);
    } catch (e) {
      console.warn(`🔄 [SyncLoroToLexical] Could not get map keys`);
    }
    return;
  }
  
  // Apply the lexical data to the node
  try {
    // For text nodes, update the text content using Lexical's proper API
    if (lexicalData.type === 'text' && lexicalNode.getType() === 'text') {
      const textNode = lexicalNode as any;
      const currentText = textNode.getTextContent();
      const newText = lexicalData.text || '';
      
      if (currentText !== newText) {
        // Use Lexical's setTextContent method to properly update the text
        textNode.setTextContent(newText);
      }
    } else {
      console.warn(`🔄 [SyncLoroToLexical] Not a text node or type mismatch - lexicalData.type: ${lexicalData.type}, node.type: ${lexicalNode.getType()}`);
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
  
}
