import { $getNodeByKey } from 'lexical';
import { BaseDiffHandler } from './BaseDiffHandler';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { TreeID } from 'loro-crdt';

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
        this.handleLexicalDataUpdate(value, binding, provider);
        break;
      case 'textContent':
        this.handleTextContentUpdate(value, binding, provider);
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

  private handleLexicalDataUpdate(
    lexicalData: any, 
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Lexical data updated:`, lexicalData);

    // If lexicalData contains a key, we can identify and update the specific lexical node
    if (lexicalData && typeof lexicalData === 'object' && lexicalData.key) {
      const nodeKey = lexicalData.key;
      
      binding.editor.update(() => {
        const lexicalNode = $getNodeByKey(nodeKey);
        if (lexicalNode) {
          // Update node properties based on the new lexical data
          if (lexicalData.textContent !== undefined && 'setTextContent' in lexicalNode) {
            (lexicalNode as any).setTextContent(lexicalData.textContent);
          }
          
          if (lexicalData.format !== undefined && 'setFormat' in lexicalNode) {
            (lexicalNode as any).setFormat(lexicalData.format);
          }
          
          console.log(`🗺️ Updated lexical node ${nodeKey} with new data`);
        } else {
          console.warn(`🗺️ Lexical node ${nodeKey} not found for update`);
        }
      }, { tag: 'loro-sync' });
    }
  }

  private handleTextContentUpdate(
    textContent: string, 
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Text content updated:`, textContent);

    // This would need context about which node is being updated
    // In practice, this should be handled through the lexical data update
    console.log(`🗺️ Text content change should be handled via lexical data update`);
  }
}
