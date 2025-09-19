import { $getNodeByKey, $getRoot, RootNode, TextNode } from 'lexical';
import { BaseDiffHandler } from './BaseDiffHandler';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { TreeID } from 'loro-crdt';
import { $diffTextContentAndApplyDelta } from '../utils/Utils';

interface MapDiff {
  type: 'map';
  updated?: Record<string, any>;
  deleted?: string[];
}

/**
 * Handles map data changes (node properties, metadata updates)
 */
export class MapDiffHandler implements BaseDiffHandler<MapDiff> {
  
  handle(diff: MapDiff, binding: Binding, provider: Provider): void {
    console.log('🗺️ Handling MapDiff:', diff);

    // Handle updated properties
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.handlePropertyUpdate(key, value, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.handlePropertyDelete(key, binding, provider);
      });
    }
  }

  // Enhanced handle method with TreeID context
  handleWithContext(diff: MapDiff, treeId: any, binding: Binding, provider: Provider): void {
    console.log('🗺️ Handling MapDiff with context:', diff, 'TreeID:', treeId);

    this.handleWithContextInternal(diff, treeId, binding, provider);
  }

  // Internal method for use when already inside editor.update()
  handleInternal(diff: MapDiff, binding: Binding, provider: Provider): void {
    // Handle updated properties
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.handlePropertyUpdate(key, value, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.handlePropertyDelete(key, binding, provider);
      });
    }
  }

  // Internal method for use when already inside editor.update() with context
  handleWithContextInternal(diff: MapDiff, treeId: any, binding: Binding, provider: Provider): void {
    // Handle updated properties with TreeID context
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.handlePropertyUpdateWithContextInternal(key, value, treeId, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.handlePropertyDelete(key, binding, provider);
      });
    }
  }

  private handlePropertyUpdateWithContext(
    key: string, 
    value: any, 
    treeId: TreeID,
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Map update with context: ${key} = ${value}, TreeID: ${treeId}`);

    // Handle specific property updates with TreeID context
    switch (key) {
      case 'lexical':
        this.handleLexicalDataUpdateWithContext(value, treeId, binding);
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        console.log(`🗺️ Text content update with context: ${value}`);
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        console.log(`🗺️ Element type updated to: ${value}`);
        break;
      default:
        console.log(`🗺️ Generic property update with context: ${key} = ${value}`);
    }
  }

  // Internal version for use when already inside editor.update()
  private handlePropertyUpdateWithContextInternal(
    key: string, 
    value: any, 
    treeId: TreeID,
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Map update with context: ${key} = ${value}, TreeID: ${treeId}`);

    // Handle specific property updates with TreeID context
    switch (key) {
      case 'lexical':
        // Extract TreeID and call internal method directly (already inside editor.update())
        let actualTreeId = treeId;
        if (typeof treeId === 'string' && treeId.startsWith('cid:')) {
          const parts = treeId.split(':');
          if (parts.length >= 3) {
            actualTreeId = parts[1] as TreeID;
          }
        }
        
        const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(actualTreeId as TreeID);
        if (lexicalKey) {
          this.handleLexicalDataUpdateInternal(value, lexicalKey, actualTreeId as TreeID);
        } else {
          console.log(`🗺️ No Lexical key found for TreeID: ${actualTreeId}`);
        }
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        console.log(`🗺️ Text content update with context: ${value}`);
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        console.log(`🗺️ Element type updated to: ${value}`);
        break;
      default:
        console.log(`🗺️ Generic property update with context: ${key} = ${value}`);
    }
  }

  private handlePropertyUpdate(
    key: string, 
    value: any, 
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Map update: ${key} = ${value}`);

    // Handle specific property updates
    switch (key) {
      case 'lexical':
        // Use targeted update only - the broad heuristic causes scrambling
        console.log(`🗺️ Lexical data update without context - skipping to prevent scrambling`);
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        console.log(`🗺️ Text content update: ${value}`);
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        console.log(`🗺️ Element type updated to: ${value}`);
        break;
      default:
        console.log(`🗺️ Generic property update: ${key} = ${value}`);
    }
  }

  private handlePropertyDelete(
    key: string, 
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Map delete: ${key}`);
    
    // Handle specific property deletions
    switch (key) {
      case 'lexical':
        console.warn(`🗺️ Lexical data was deleted - this may indicate node removal`);
        break;
      default:
        console.log(`🗺️ Generic property deleted: ${key}`);
    }
  }

  private handleLexicalDataUpdateWithContext(
    lexicalData: any,
    treeId: TreeID | string,
    binding: Binding,
  ): void {
    console.log(`🗺️ Lexical data updated with context:`, lexicalData, 'TreeID:', treeId);

    // Extract the actual TreeID from container ID format
    // Container ID format: "cid:6@7648424808278730813:Map"
    // TreeID format: "6@7648424808278730813"
    let actualTreeId = treeId;
    if (typeof treeId === 'string' && treeId.startsWith('cid:')) {
      const parts = treeId.split(':');
      if (parts.length >= 3) {
        actualTreeId = parts[1]; // Extract "6@7648424808278730813" from "cid:6@7648424808278730813:Map"
        console.log(`🗺️ Extracted TreeID from container: ${treeId} → ${actualTreeId}`);
      }
    }

    // Use the TreeID to find the specific Lexical node
    const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(actualTreeId as TreeID);
    if (!lexicalKey) {
      console.log(`🗺️ No Lexical key found for TreeID: ${actualTreeId} (original: ${treeId})`);
      return;
    }

    if (lexicalData && typeof lexicalData === 'object') {
      binding.editor.update(() => {
        this.handleLexicalDataUpdateInternal(lexicalData, lexicalKey, actualTreeId as TreeID);
      });
    }
  }

  // Internal method for use when already inside editor.update()
  private handleLexicalDataUpdateInternal(lexicalData: any, lexicalKey: string, treeId: TreeID): void {
    const targetType = lexicalData.type || lexicalData.__type;
    
    // Special logging for text node lookups
    if (targetType === 'text') {
      console.log(`📝 TEXT NODE MAP UPDATE ATTEMPT:`);
      console.log(`📝   Looking for Lexical key: ${lexicalKey}`);
      console.log(`📝   TreeID: ${treeId}`);
      console.log(`📝   Lexical Data:`, JSON.stringify(lexicalData, null, 2));
    }
    
    const targetNode = $getNodeByKey(lexicalKey);
    if (!targetNode) {
      console.log(`🗺️ No Lexical node found for key: ${lexicalKey}`);
      if (targetType === 'text') {
        console.error(`📝 TEXT NODE NOT FOUND IN EDITOR:`);
        console.error(`📝   Searched key: ${lexicalKey}`);
        console.error(`📝   TreeID: ${treeId}`);
        
        // Debug: List all nodes in editor
        const root = $getRoot();
        console.log(`📝   Current editor nodes:`, root.getChildren().map(child => {
          const childInfo: any = {
            key: child.getKey(),
            type: child.getType()
          };
          // Check if child is ElementNode with children
          if ('getChildren' in child && typeof child.getChildren === 'function') {
            childInfo.children = (child as any).getChildren().map((c: any) => ({
              key: c.getKey(),
              type: c.getType(),
              text: 'getTextContent' in c ? c.getTextContent() : 'n/a'
            }));
          }
          return childInfo;
        }));
      }
      return;
    }
    
    const textContent = lexicalData.__text || lexicalData.text || lexicalData.textContent;
    
    if (targetType === 'text' && textContent !== undefined) {
      console.log(`🗺️ Updating specific text node ${lexicalKey}: "${targetNode.getTextContent()}" → "${textContent}"`);
      
      // Cast to TextNode to access text-specific methods
      if (targetNode.getType() === 'text') {
        const textNode = targetNode as TextNode;
        
        // Only update if the content is actually different to avoid unnecessary updates
        const currentText = textNode.getTextContent();
        if (currentText !== textContent) {
          console.log(`🗺️ Text content differs, updating: "${currentText}" → "${textContent}"`);
          
          // Apply the text update using delta to preserve cursor position and minimize disruption
          $diffTextContentAndApplyDelta(textNode, lexicalKey, currentText, textContent);
          console.log(`🗺️ Text content updated successfully using diffTextContentAndApplyDelta`);
        } else {
          console.log(`🗺️ Text content unchanged, skipping update: "${textContent}"`);
        }
        
        // Apply other text properties if present
        if (lexicalData.format !== undefined) {
          textNode.setFormat(lexicalData.format);
        }
        if (lexicalData.style !== undefined) {
          textNode.setStyle(lexicalData.style);
        }
      }
    } else {
      console.log(`🗺️ Lexical data update for node ${lexicalKey} - type: ${targetType}, textContent: ${textContent}`);
    }
  }
}
