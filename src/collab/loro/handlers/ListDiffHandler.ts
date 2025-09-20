import { BaseDiffHandler } from './BaseDiffHandler';
import { Binding } from '../Bindings';
import { Provider } from '../State';

interface ListDiff {
  type: 'list';
  diff?: Array<{
    type: 'insert' | 'delete' | 'retain';
    index?: number;
    length?: number;
    value?: any;
  }>;
}

/**
 * Handles list changes (insertions, deletions, moves in ordered structures)
 */
export class ListDiffHandler implements BaseDiffHandler<ListDiff> {
  
  handle(diff: ListDiff, binding: Binding, provider: Provider): void {
    console.log('📋 Handling ListDiff:', diff);
    this.handleInternal(diff, binding, provider);
  }

  // Internal method for use when already inside editor.update()
  handleInternal(diff: ListDiff, binding: Binding, provider: Provider): void {
    if (diff.diff) {
      diff.diff.forEach((change: any) => {
        switch (change.type) {
          case 'insert':
            this.handleInsert(change, binding, provider);
            break;
          case 'delete':
            this.handleDelete(change, binding, provider);
            break;
          case 'retain':
            this.handleRetain(change, binding, provider);
            break;
          default:
            console.warn(`📋 Unknown list change type: ${change.type}`);
        }
      });
    }
  }

  private handleInsert(
    change: { index: number; value: any }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // This typically represents insertion of child nodes in an ElementNode
    // The actual node creation should be handled by TreeDiffHandler
    // This handler focuses on the ordering and position updates
    
    // For now, log the operation - specific implementation would depend on
    // the context of which list/container this change applies to
  }

  private handleDelete(
    change: { index: number; length: number }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // This typically represents removal of child nodes from an ElementNode
    // The actual node deletion should be handled by TreeDiffHandler
    // This handler focuses on the ordering and position updates
    
  }

  private handleRetain(
    change: { index?: number; length?: number; attributes?: any }, 
    binding: Binding, 
    provider: Provider
  ): void {
    // Retain operations typically don't require action in Lexical
    // They represent portions of the list that remain unchanged
    
    if (change.attributes) {
      console.log(`📋 List retain with attributes at ${change.index}, length: ${change.length}`, change.attributes);
      // Handle any attribute changes if needed
    }
  }
}
