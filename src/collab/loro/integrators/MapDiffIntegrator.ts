import { $getNodeByKey, $getRoot, RootNode, TextNode } from 'lexical';
import { BaseDiffIntegrator } from './BaseDiffIntegrator';
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
export class MapDiffIntegrator implements BaseDiffIntegrator<MapDiff> {
  
  handle(diff: MapDiff, binding: Binding, provider: Provider): void {

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

    // Handle specific property updates with TreeID context
    switch (key) {
      case 'lexical':
        this.handleLexicalDataUpdateWithContext(value, treeId, binding);
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        //
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
        }
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        // Generic property update with context
        break;
    }
  }

  private handlePropertyUpdate(
    key: string, 
    value: any, 
    binding: Binding, 
    provider: Provider
  ): void {
    // Handle specific property updates
    switch (key) {
      case 'lexical':
        // Use targeted update only - the broad heuristic causes scrambling
        break;
      case 'textContent':
        // Text content updates should be handled via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        // Generic property update
        break;
    }
  }

  private handlePropertyDelete(
    key: string, 
    binding: Binding, 
    provider: Provider
  ): void {
    
    // Handle specific property deletions
    switch (key) {
      case 'lexical':
        break;
      default:
        // Generic property deleted
        break;
    }
  }

  private handleLexicalDataUpdateWithContext(
    lexicalData: any,
    treeId: TreeID | string,
    binding: Binding,
  ): void {

    // Extract the actual TreeID from container ID format
    // Container ID format: "cid:6@7648424808278730813:Map"
    // TreeID format: "6@7648424808278730813"
    let actualTreeId = treeId;
    if (typeof treeId === 'string' && treeId.startsWith('cid:')) {
      const parts = treeId.split(':');
      if (parts.length >= 3) {
        actualTreeId = parts[1]; // Extract "6@7648424808278730813" from "cid:6@7648424808278730813:Map"
      }
    }

    // Use the TreeID to find the specific Lexical node
    const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(actualTreeId as TreeID);
    if (!lexicalKey) {
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
    
    const targetNode = $getNodeByKey(lexicalKey);
    if (!targetNode) {
      return;
    }
    
    const textContent = lexicalData.__text || lexicalData.text || lexicalData.textContent;
    
    if (targetType === 'text' && textContent !== undefined) {
      
      // Cast to TextNode to access text-specific methods
      if (targetNode.getType() === 'text') {
        const textNode = targetNode as TextNode;
        
        // Only update if the content is actually different to avoid unnecessary updates
        const currentText = textNode.getTextContent();
        if (currentText !== textContent) {
          
          // Apply the text update using delta to preserve cursor position and minimize disruption
          $diffTextContentAndApplyDelta(textNode, lexicalKey, currentText, textContent);
        }
        
        // Apply other text properties if present
        if (lexicalData.format !== undefined) {
          textNode.setFormat(lexicalData.format);
        }
        if (lexicalData.style !== undefined) {
          textNode.setStyle(lexicalData.style);
        }
      }
    }
  }
}
