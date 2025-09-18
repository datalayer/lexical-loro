import { LexicalNode } from 'lexical';

/**
 * Data structure stored in Loro tree node data
 */
export interface LexicalNodeData {
  lexicalNode: LexicalNode;
}

/**
 * Helper functions for working with LexicalNodeData
 */
export class LexicalNodeDataHelper {
  /**
   * Create LexicalNodeData from a Lexical node
   */
  static create(lexicalNode: LexicalNode): LexicalNodeData {
    return {
      lexicalNode
    };
  }

  /**
   * Serialize LexicalNodeData for storage in Loro
   */
  static serialize(data: LexicalNodeData): string {
    try {
      return JSON.stringify({
        lexicalNode: data.lexicalNode.exportJSON()
      });
    } catch (error) {
      console.warn('Failed to serialize LexicalNodeData:', error);
      return JSON.stringify({
        lexicalNode: {
          type: data.lexicalNode.getType(),
          key: data.lexicalNode.getKey()
        }
      });
    }
  }

  /**
   * Deserialize LexicalNodeData from Loro storage
   */
  static deserialize(serialized: string): LexicalNodeData | null {
    try {
      const parsed = JSON.parse(serialized);
      
      // Validate that we have the expected structure
      if (!parsed || !parsed.lexicalNode) {
        console.warn('Invalid LexicalNodeData structure:', parsed);
        return null;
      }
      
      return {
        lexicalNode: parsed.lexicalNode
      };
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData:', error);
      return null;
    }
  }

  /**
   * Extract the LexicalNode from LexicalNodeData
   */
  static getLexicalNode(data: LexicalNodeData): LexicalNode {
    return data.lexicalNode;
  }

  /**
   * Get node type from LexicalNodeData
   */
  static getNodeType(data: LexicalNodeData): string {
    return data.lexicalNode.getType();
  }
}