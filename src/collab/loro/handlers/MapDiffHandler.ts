import { $getNodeByKey, $getRoot } from 'lexical';
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

  private handleLexicalDataUpdate(
    lexicalData: any, 
    binding: Binding, 
    provider: Provider
  ): void {
    console.log(`🗺️ Lexical data updated:`, lexicalData);
    console.log(`🗺️ Lexical data keys:`, Object.keys(lexicalData || {}));
    console.log(`🗺️ Lexical data.__text:`, lexicalData?.__text);
    console.log(`🗺️ Lexical data text content:`, JSON.stringify(lexicalData, null, 2));

    // Handle live editing updates by finding nodes that match the updated data
    // Since we don't have TreeID context here, we'll need to find matching nodes by their properties
    
    if (lexicalData && typeof lexicalData === 'object') {
      binding.editor.update(() => {
        // Try to find the target node by matching type and other properties
        const root = $getRoot();
        const targetType = lexicalData.type || lexicalData.__type;
        
        // Check for text content in various possible properties
        const textContent = lexicalData.__text || lexicalData.text || lexicalData.textContent;
        
        if (targetType === 'text' && textContent !== undefined) {
          // For text nodes, find matching node and update its content
          console.log(`🗺️ Found text content to update: "${textContent}"`);
          this.updateTextNodeContent(textContent, lexicalData, root, binding);
        } else if (targetType && (lexicalData.format !== undefined || lexicalData.style !== undefined)) {
          // For other property updates (format, style, etc.)
          this.updateNodeProperties(targetType, lexicalData, root, binding);
        } else {
          console.log(`🗺️ Lexical data update - no matching update strategy for type: ${targetType}, textContent: ${textContent}`);
        }
      }, { tag: 'loro-map-sync' });
    }
  }

  private updateTextNodeContent(
    newText: string, 
    nodeData: any, 
    root: any, 
    binding: Binding
  ): void {
    // Find text nodes that might match this update
    // In a more sophisticated system, we'd have better node tracking
    
    function findAndUpdateTextNodes(node: any): boolean {
      if (node.getType && node.getType() === 'text') {
        // Check if this could be the target node
        const currentText = node.getTextContent();
        
        // Simple heuristic: if the current text is a substring of the new text
        // or they're similar, this might be our target node
        if (newText.includes(currentText) || currentText.includes(newText) || 
            Math.abs(newText.length - currentText.length) <= 5) {
          
          console.log(`🗺️ Updating text node: "${currentText}" → "${newText}"`);
          node.setTextContent(newText);
          
          // Apply other text properties if present
          if (nodeData.format !== undefined) {
            node.setFormat(nodeData.format);
          }
          if (nodeData.style !== undefined) {
            node.setStyle(nodeData.style);
          }
          
          return true; // Found and updated
        }
      }
      
      // Recursively check children if this is an element node
      if (node.getChildren) {
        const children = node.getChildren();
        for (const child of children) {
          if (findAndUpdateTextNodes(child)) {
            return true;
          }
        }
      }
      
      return false;
    }
    
    const updated = findAndUpdateTextNodes(root);
    if (updated) {
      console.log(`🗺️ ✅ Successfully updated text node content`);
    } else {
      console.log(`🗺️ ❌ Could not find matching text node to update`);
    }
  }

  private updateNodeProperties(
    targetType: string,
    nodeData: any,
    root: any, 
    binding: Binding
  ): void {
    console.log(`🗺️ Updating ${targetType} node properties:`, nodeData);
    // This would handle format, style, and other property updates
    // Implementation depends on specific property types needed
  }
}
