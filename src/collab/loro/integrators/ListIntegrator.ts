/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { BaseIntegrator } from './BaseIntegrator';
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
export class ListIntegrator implements BaseIntegrator<ListDiff> {
  
  integrate(diff: ListDiff, binding: Binding, provider: Provider): void {
    console.log('📋 Handling ListDiff:', diff);
    this.integrateInternal(diff, binding, provider);
  }

  // Internal method for use when already inside editor.update()
  integrateInternal(diff: ListDiff, binding: Binding, provider: Provider): void {
    if (diff.diff) {
      diff.diff.forEach((change: any) => {
        switch (change.type) {
          case 'insert':
            this.integrateInsert(change, binding, provider);
            break;
          case 'delete':
            this.integrateDelete(change, binding, provider);
            break;
          case 'retain':
            this.integrateRetain(change, binding, provider);
            break;
          default:
            console.warn(`📋 Unknown list change type: ${change.type}`);
        }
      });
    }
  }

  private integrateInsert(
    change: { index: number; value: any }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // This typically represents insertion of child nodes in an ElementNode
    // The actual node creation should be integrated by TreeIntegrator
    // This integrater focuses on the ordering and position updates
    
    // For now, log the operation - specific implementation would depend on
    // the context of which list/container this change applies to
  }

  private integrateDelete(
    change: { index: number; length: number }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // This typically represents removal of child nodes from an ElementNode
    // The actual node deletion should be integrated by TreeIntegrator
    // This integrater focuses on the ordering and position updates
    
  }

  private integrateRetain(
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
