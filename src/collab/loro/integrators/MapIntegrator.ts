import { $getNodeByKey, $getRoot, $isDecoratorNode, $isElementNode, RootNode, TextNode } from 'lexical';
import { BaseIntegrator } from './BaseIntegrator';
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
export class MapIntegrator implements BaseIntegrator<MapDiff> {
  
  integrate(diff: MapDiff, binding: Binding, provider: Provider): void {

    // Handle updated properties
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.integratePropertyUpdate(key, value, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.integratePropertyDelete(key, binding, provider);
      });
    }
  }

  // Enhanced integrate method with TreeID context
  integrateWithContext(diff: MapDiff, treeId: any, binding: Binding, provider: Provider): void {

    this.integrateWithContextInternal(diff, treeId, binding, provider);
  }

  // Internal method for use when already inside editor.update()
  integrateInternal(diff: MapDiff, binding: Binding, provider: Provider): void {
    // Handle updated properties
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.integratePropertyUpdate(key, value, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.integratePropertyDelete(key, binding, provider);
      });
    }
  }

  // Internal method for use when already inside editor.update() with context
  integrateWithContextInternal(diff: MapDiff, treeId: any, binding: Binding, provider: Provider): void {
    // Handle updated properties with TreeID context
    if (diff.updated) {
      Object.entries(diff.updated).forEach(([key, value]) => {
        this.integratePropertyUpdateWithContextInternal(key, value, treeId, binding, provider);
      });
    }

    // Handle deleted properties
    if (diff.deleted) {
      diff.deleted.forEach((key: string) => {
        this.integratePropertyDelete(key, binding, provider);
      });
    }
  }

  private integratePropertyUpdateWithContext(
    key: string, 
    value: any, 
    treeId: TreeID,
    binding: Binding, 
    provider: Provider
  ): void {

    // Handle specific property updates with TreeID context
    switch (key) {
      case 'lexical':
        this.integrateLexicalDataUpdateWithContext(value, treeId, binding);
        break;
      case 'textContent':
        // Text content updates should be integrated via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        //
    }
  }

  // Internal version for use when already inside editor.update()
  private integratePropertyUpdateWithContextInternal(
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
        let actualTreeID = treeId;
        if (typeof treeId === 'string' && treeId.startsWith('cid:')) {
          const parts = treeId.split(':');
          if (parts.length >= 3) {
            actualTreeID = parts[1] as TreeID;
          }
        }
        
        const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(actualTreeID as TreeID);
        if (lexicalKey) {
          this.integrateLexicalDataUpdateInternal(value, lexicalKey, actualTreeID as TreeID, binding);
        }
        break;
      case 'textContent':
        // Text content updates should be integrated via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        // Generic property update with context
        break;
    }
  }

  private integratePropertyUpdate(
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
        // Text content updates should be integrated via lexical data updates
        break;
      case 'elementType':
        // Element type changes are rare, mostly for debugging
        break;
      default:
        // Generic property update
        break;
    }
  }

  private integratePropertyDelete(
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

  private integrateLexicalDataUpdateWithContext(
    lexicalData: any,
    treeId: TreeID | string,
    binding: Binding,
  ): void {

    // Extract the actual TreeID from container ID format
    // Container ID format: "cid:6@7648424808278730813:Map"
    // TreeID format: "6@7648424808278730813"
    let actualTreeID = treeId;
    if (typeof treeId === 'string' && treeId.startsWith('cid:')) {
      const parts = treeId.split(':');
      if (parts.length >= 3) {
        actualTreeID = parts[1]; // Extract "6@7648424808278730813" from "cid:6@7648424808278730813:Map"
      }
    }

    // Use the TreeID to find the specific Lexical node
    const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(actualTreeID as TreeID);
    if (!lexicalKey) {
      return;
    }

    if (lexicalData && typeof lexicalData === 'object') {
      binding.editor.update(() => {
        this.integrateLexicalDataUpdateInternal(lexicalData, lexicalKey, actualTreeID as TreeID, binding);
      });
    }
  }

  // Internal method for use when already inside editor.update()
  private integrateLexicalDataUpdateInternal(lexicalData: any, lexicalKey: string, treeId: TreeID, binding: Binding): void {
    // Handle Loro container objects that need conversion to plain JS
    let data = lexicalData;
    if (data && typeof data === 'object' && typeof data.toJSON === 'function') {
      data = data.toJSON();
    }

    const targetNode = $getNodeByKey(lexicalKey);
    if (!targetNode) {
      return;
    }
    
    const targetType = targetNode.getType();
    const textContent = data.__text || data.text || data.textContent;
    
    if (targetType === 'text' && textContent !== undefined) {
      // Text nodes: use diff approach to preserve cursor position
      const textNode = targetNode as TextNode;
      const currentText = textNode.getTextContent();
      if (currentText !== textContent) {
        $diffTextContentAndApplyDelta(textNode, lexicalKey, currentText, textContent);
      }
      // Apply text-specific properties
      if (data.format !== undefined) {
        textNode.setFormat(data.format);
      }
      if (data.style !== undefined) {
        textNode.setStyle(data.style);
      }
    } else if ($isDecoratorNode(targetNode)) {
      // Decorator nodes (excalidraw, images, counters, JupyterCellNode, …):
      // Many decorator implementations do NOT override `updateFromJSON` for
      // their custom properties — they only set them in the constructor via
      // `importJSON`.  Since decorators are leaf nodes (no children), it is
      // safe to replace the whole node with a fresh `importJSON` instance.
      try {
        const registeredNodes = binding.editor._nodes;
        const nodeInfo = registeredNodes.get(targetType);
        if (!nodeInfo) {
          console.warn(`🗺️ MapIntegrator: Node type '${targetType}' not registered`);
          return;
        }
        const serializedData = { ...data };
        if (!serializedData.type) serializedData.type = targetType;
        if (serializedData.version === undefined) serializedData.version = 1;
        if (!('children' in serializedData)) serializedData.children = [];

        const newNode = nodeInfo.klass.importJSON(serializedData);
        targetNode.replace(newNode);
        // Update bidirectional mapping: old key → remove, new key → treeId
        // Use removeMappingForKey (not deleteMapping) because we are on the
        // integration side — the Loro tree node must NOT be deleted; we are
        // only swapping which Lexical key points to it.
        binding.nodeMapper.removeMappingForKey(lexicalKey);
        binding.nodeMapper.setMapping(newNode.getKey(), treeId);
      } catch (error) {
        console.warn(`🗺️ MapIntegrator: importJSON+replace failed for decorator ${targetType} node ${lexicalKey}:`, error);
      }
    } else {
      try {
        const serializedData = { ...data };
        if (!serializedData.type) {
          serializedData.type = targetType;
        }
        if (serializedData.version === undefined) {
          serializedData.version = 1;
        }
        // Provide empty children (TreeIntegrator manages children separately)
        if (!('children' in serializedData)) {
          serializedData.children = [];
        }
        const writable = targetNode.getWritable();
        writable.updateFromJSON(serializedData);
      } catch (error) {
        console.warn(`🗺️ MapIntegrator: updateFromJSON failed for ${targetType} node ${lexicalKey}:`, error);
      }
    }
  }
}
