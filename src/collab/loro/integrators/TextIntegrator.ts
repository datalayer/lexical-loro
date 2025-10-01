/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { BaseIntegrator } from './BaseIntegrator';
import { Binding } from '../Bindings';
import { Provider } from '../State';

interface TextDiff {
  type: 'text';
  diff?: Array<{
    type: 'insert' | 'delete' | 'retain';
    index?: number;
    length?: number;
    value?: string;
    attributes?: any;
  }>;
}

/**
 * Handles text changes (character insertions, deletions, formatting)
 */
export class TextIntegrator implements BaseIntegrator<TextDiff> {
  
  integrate(diff: TextDiff, binding: Binding, provider: Provider): void {
    this.integrateInternal(diff, binding, provider);
  }

  // Internal method for use when already inside editor.update()
  integrateInternal(diff: TextDiff, binding: Binding, provider: Provider): void {
    if (diff.diff) {
      diff.diff.forEach((change: any) => {
        switch (change.type) {
          case 'insert':
            this.integrateTextInsert(change, binding, provider);
            break;
          case 'delete':
            this.integrateTextDelete(change, binding, provider);
            break;
          case 'retain':
            this.integrateTextRetain(change, binding, provider);
            break;
          default:
            console.warn(`📝 Unknown text change type: ${change.type}`);
        }
      });
    }
  }

  private integrateTextInsert(
    change: { index: number; value: string }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // To integrate text insertion, we need to know which TextNode this applies to
    // This information should come from the event context or be tracked separately
    
    // For now, this is a placeholder - in a complete implementation,
    // we would need to identify the target TextNode and update it
  }

  private integrateTextDelete(
    change: { index: number; length: number }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // Similar to insert, we need target node context for text deletion
  }

  private integrateTextRetain(
    change: { index?: number; length?: number; attributes?: any }, 
    binding: Binding, 
    provider: Provider
  ): void {
    if (change.attributes) {
      // Handle text formatting changes
      this.applyTextFormatting({ ...change, attributes: change.attributes }, binding, provider);
    }
  }

  private applyTextFormatting(
    change: { index?: number; length?: number; attributes: any }, 
    binding: Binding, 
    provider: Provider
  ): void {

    // Text formatting in Lexical is typically integrated through TextNode format property
    // This would need to be coordinated with the specific TextNode being modified
    
    // Example formatting attributes might include:
    // - bold, italic, underline
    // - font size, color
    // - etc.
    
  }
}
