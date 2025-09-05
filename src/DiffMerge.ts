/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $createLineBreakNode,
  $isElementNode,
  type LexicalEditor,
  type LexicalNode,
  type ElementNode,
  type TextNode,
} from 'lexical';
import {
  $createHeadingNode,
  type HeadingNode,
} from '@lexical/rich-text';
import {
  $createCodeNode,
  type CodeNode,
} from '@lexical/code';
import {
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  type TableRowNode,
  type TableCellNode,
} from '@lexical/table';

/**
 * DiffMerge System for Lexical Editor
 * 
 * This module provides sophisticated differential updates for Lexical editor states,
 * preventing wholesale state replacement that would destroy React decorator nodes
 * like YouTube embeds, counters, and other custom components.
 * 
 * Key Features:
 * - Selective node updates (only changed content)
 * - Decorator node preservation (YouTube, Counter nodes remain untouched)
 * - Table structure support with cell-level updates
 * - Graceful fallback for unsupported operations
 * - Deep content comparison to minimize unnecessary updates
 * 
 * Usage:
 * ```typescript
 * const success = applyDifferentialUpdate(editor, newState, 'collaboration');
 * if (!success) {
 *   // Fall back to setEditorState if differential update fails
 *   editor.setEditorState(newState);
 * }
 * ```
 */

interface EditorStateData {
  root: {
    type: 'root';
    children: any[];
    direction?: string | null;
    format?: number;
    indent?: number;
    version?: number;
  };
}

/**
 * Checks if a node type can be created/handled by the differential update system
 */
function canCreateNodeType(type: string): boolean {
  const supportedTypes = new Set([
    'root',
    'paragraph', 
    'text',
    'linebreak',
    'heading',
    'code',
    'table',
    'tablerow',
    'tablecell'
  ]);
  return supportedTypes.has(type);
}

/**
 * Checks if a node is a decorator node that should be preserved
 */
function isDecoratorNodeType(type: string): boolean {
  const decoratorTypes = new Set([
    'youtube',
    'counter',
    'image',
    'tweet',
    'figma',
    'poll',
    'sticky'
  ]);
  return decoratorTypes.has(type.toLowerCase());
}

/**
 * Creates a Lexical node from serialized data
 */
function createNodeFromData(data: any): LexicalNode | null {
  const type = data.type;
  
  if (!canCreateNodeType(type)) {
    console.warn(`⚠️ Cannot create node of type: ${type}`);
    return null;
  }

  try {
    switch (type) {
      case 'paragraph': {
        const node = $createParagraphNode();
        if (data.format !== undefined) node.setFormat(data.format);
        if (data.indent !== undefined) node.setIndent(data.indent);
        if (data.direction !== undefined) node.setDirection(data.direction);
        return node;
      }
      
      case 'heading': {
        const node = $createHeadingNode(data.tag || 'h1');
        if (data.format !== undefined) node.setFormat(data.format);
        if (data.indent !== undefined) node.setIndent(data.indent);
        if (data.direction !== undefined) node.setDirection(data.direction);
        return node;
      }
      
      case 'code': {
        const node = $createCodeNode(data.language);
        if (data.format !== undefined) node.setFormat(data.format);
        if (data.indent !== undefined) node.setIndent(data.indent);
        if (data.direction !== undefined) node.setDirection(data.direction);
        return node;
      }
      
      case 'text': {
        const node = $createTextNode(data.text || '');
        if (data.format !== undefined) node.setFormat(data.format);
        if (data.style !== undefined) node.setStyle(data.style);
        if (data.mode !== undefined) node.setMode(data.mode);
        if (data.detail !== undefined) node.setDetail(data.detail);
        return node;
      }
      
      case 'linebreak': {
        return $createLineBreakNode();
      }
      
      case 'table': {
        return $createTableNode();
      }
      
      case 'tablerow': {
        const node = $createTableRowNode();
        if (data.height !== undefined) node.setHeight(data.height);
        return node;
      }
      
      case 'tablecell': {
        const node = $createTableCellNode(
          data.headerState || 0,
          data.colSpan || 1,
          data.width || undefined
        );
        if (data.rowSpan !== undefined) node.setRowSpan(data.rowSpan);
        if (data.backgroundColor !== undefined) node.setBackgroundColor(data.backgroundColor);
        return node;
      }
      
      default:
        console.warn(`⚠️ Unsupported node type for creation: ${type}`);
        return null;
    }
  } catch (error) {
    console.error(`❌ Error creating node of type ${type}:`, error);
    return null;
  }
}

/**
 * Deep comparison of node content to determine if update is needed
 */
function nodesHaveSameContent(existing: LexicalNode, newData: any): boolean {
  const existingType = existing.getType();
  const newType = newData.type;
  
  if (existingType !== newType) {
    return false;
  }
  
  try {
    switch (existingType) {
      case 'text': {
        const textNode = existing as TextNode;
        return textNode.getTextContent() === (newData.text || '') &&
               textNode.getFormat() === (newData.format || 0) &&
               textNode.getStyle() === (newData.style || '') &&
               textNode.getMode() === (newData.mode || 0) &&
               textNode.getDetail() === (newData.detail || 0);
      }
      
      case 'paragraph': {
        const elementNode = existing as ElementNode;
        return elementNode.getFormat() === (newData.format || 0) &&
               elementNode.getIndent() === (newData.indent || 0) &&
               elementNode.getDirection() === newData.direction;
      }
      
      case 'heading': {
        const headingNode = existing as HeadingNode;
        return headingNode.getTag() === (newData.tag || 'h1') &&
               headingNode.getFormat() === (newData.format || 0) &&
               headingNode.getIndent() === (newData.indent || 0) &&
               headingNode.getDirection() === newData.direction;
      }
      
      case 'code': {
        const codeNode = existing as CodeNode;
        return codeNode.getLanguage() === newData.language &&
               codeNode.getFormat() === (newData.format || 0) &&
               codeNode.getIndent() === (newData.indent || 0) &&
               codeNode.getDirection() === newData.direction;
      }
      
      case 'table':
      case 'tablerow':
      case 'tablecell':
        // For table nodes, we primarily care about structure, which is handled by child comparison
        return true;
      
      case 'linebreak':
        return true; // Line breaks are always the same
      
      default:
        // For unknown types, assume they need updating
        return false;
    }
  } catch (error) {
    console.error(`❌ Error comparing nodes of type ${existingType}:`, error);
    return false;
  }
}

/**
 * Updates properties of an existing node from new data
 */
function updateNodeFromData(existing: LexicalNode, newData: any): boolean {
  const nodeType = existing.getType();
  
  try {
    switch (nodeType) {
      case 'text': {
        const textNode = existing as TextNode;
        const textChanged = textNode.getTextContent() !== (newData.text || '');
        const formatChanged = textNode.getFormat() !== (newData.format || 0);
        const styleChanged = textNode.getStyle() !== (newData.style || '');
        const modeChanged = textNode.getMode() !== (newData.mode || 0);
        const detailChanged = textNode.getDetail() !== (newData.detail || 0);
        
        if (textChanged) textNode.setTextContent(newData.text || '');
        if (formatChanged) textNode.setFormat(newData.format || 0);
        if (styleChanged) textNode.setStyle(newData.style || '');
        if (modeChanged) textNode.setMode(newData.mode || 0);
        if (detailChanged) textNode.setDetail(newData.detail || 0);
        
        return textChanged || formatChanged || styleChanged || modeChanged || detailChanged;
      }
      
      case 'paragraph': {
        const elementNode = existing as ElementNode;
        const formatChanged = elementNode.getFormat() !== (newData.format || 0);
        const indentChanged = elementNode.getIndent() !== (newData.indent || 0);
        const directionChanged = elementNode.getDirection() !== newData.direction;
        
        if (formatChanged) elementNode.setFormat(newData.format || 0);
        if (indentChanged) elementNode.setIndent(newData.indent || 0);
        if (directionChanged) elementNode.setDirection(newData.direction);
        
        return formatChanged || indentChanged || directionChanged;
      }
      
      case 'heading': {
        const headingNode = existing as HeadingNode;
        const tagChanged = headingNode.getTag() !== (newData.tag || 'h1');
        const formatChanged = headingNode.getFormat() !== (newData.format || 0);
        const indentChanged = headingNode.getIndent() !== (newData.indent || 0);
        const directionChanged = headingNode.getDirection() !== newData.direction;
        
        if (tagChanged) headingNode.setTag(newData.tag || 'h1');
        if (formatChanged) headingNode.setFormat(newData.format || 0);
        if (indentChanged) headingNode.setIndent(newData.indent || 0);
        if (directionChanged) headingNode.setDirection(newData.direction);
        
        return tagChanged || formatChanged || indentChanged || directionChanged;
      }
      
      case 'code': {
        const codeNode = existing as CodeNode;
        const languageChanged = codeNode.getLanguage() !== newData.language;
        const formatChanged = codeNode.getFormat() !== (newData.format || 0);
        const indentChanged = codeNode.getIndent() !== (newData.indent || 0);
        const directionChanged = codeNode.getDirection() !== newData.direction;
        
        if (languageChanged) codeNode.setLanguage(newData.language);
        if (formatChanged) codeNode.setFormat(newData.format || 0);
        if (indentChanged) codeNode.setIndent(newData.indent || 0);
        if (directionChanged) codeNode.setDirection(newData.direction);
        
        return languageChanged || formatChanged || indentChanged || directionChanged;
      }
      
      case 'tablecell': {
        const cellNode = existing as TableCellNode;
        let changed = false;
        
        if (newData.rowSpan !== undefined && cellNode.getRowSpan() !== newData.rowSpan) {
          cellNode.setRowSpan(newData.rowSpan);
          changed = true;
        }
        if (newData.backgroundColor !== undefined && cellNode.getBackgroundColor() !== newData.backgroundColor) {
          cellNode.setBackgroundColor(newData.backgroundColor);
          changed = true;
        }
        
        return changed;
      }
      
      case 'tablerow': {
        const rowNode = existing as TableRowNode;
        if (newData.height !== undefined && rowNode.getHeight() !== newData.height) {
          rowNode.setHeight(newData.height);
          return true;
        }
        return false;
      }
      
      default:
        return false;
    }
  } catch (error) {
    console.error(`❌ Error updating node of type ${nodeType}:`, error);
    return false;
  }
}

/**
 * Recursively merges children, preserving decorator nodes
 */
function mergeChildren(parent: ElementNode, newChildren: any[]): boolean {
  const existingChildren = parent.getChildren();
  let hasChanges = false;
  
  // Track which existing children to keep
  const childrenToKeep: LexicalNode[] = [];
  const decoratorNodes: LexicalNode[] = [];
  
  // First pass: identify decorator nodes to preserve
  existingChildren.forEach(child => {
    if (isDecoratorNodeType(child.getType())) {
      decoratorNodes.push(child);
      console.log(`🔒 Preserving decorator node: ${child.getType()}`);
    }
  });
  
  // Second pass: process new children and match with existing
  for (let i = 0; i < newChildren.length; i++) {
    const newChildData = newChildren[i];
    const newChildType = newChildData.type;
    
    // Skip unsupported node types
    if (!canCreateNodeType(newChildType)) {
      console.warn(`⚠️ Skipping unsupported node type: ${newChildType}`);
      continue;
    }
    
    // Find matching existing child at this position
    const existingChild = existingChildren[i];
    
    if (existingChild && existingChild.getType() === newChildType) {
      // Same type at same position - try to update in place
      const contentSame = nodesHaveSameContent(existingChild, newChildData);
      
      if (!contentSame) {
        // Update the existing node's properties
        const updated = updateNodeFromData(existingChild, newChildData);
        if (updated) {
          hasChanges = true;
        }
      }
      
      // Handle children recursively for element nodes
      if ($isElementNode(existingChild) && newChildData.children) {
        const childrenChanged = mergeChildren(existingChild, newChildData.children);
        if (childrenChanged) {
          hasChanges = true;
        }
      }
      
      childrenToKeep.push(existingChild);
    } else {
      // Different type or no existing child - create new node
      const newNode = createNodeFromData(newChildData);
      if (newNode) {
        // Add children if it's an element node
        if ($isElementNode(newNode) && newChildData.children) {
          mergeChildren(newNode, newChildData.children);
        }
        childrenToKeep.push(newNode);
        hasChanges = true;
      }
    }
  }
  
  // Third pass: re-add preserved decorator nodes at the end
  decoratorNodes.forEach(decoratorNode => {
    childrenToKeep.push(decoratorNode);
  });
  
  // Update parent's children if there are changes
  if (hasChanges || existingChildren.length !== childrenToKeep.length) {
    // Clear and re-add all children
    existingChildren.forEach(child => {
      if (!childrenToKeep.includes(child)) {
        child.remove();
      }
    });
    
    // Append new/updated children in order
    childrenToKeep.forEach(child => {
      if (!child.getParent()) {
        parent.append(child);
      }
    });
    
    return true;
  }
  
  return hasChanges;
}

/**
 * Main function to apply differential updates to the editor
 */
export function applyDifferentialUpdate(
  editor: LexicalEditor, 
  newStateData: EditorStateData | any, 
  source: string = 'unknown'
): boolean {
  try {
    // Validate input format
    if (!newStateData || typeof newStateData !== 'object') {
      console.warn('⚠️ Invalid state data for differential update');
      return false;
    }
    
    // Handle different input formats
    let rootData;
    if (newStateData.root) {
      rootData = newStateData.root;
    } else if (newStateData.type === 'root') {
      rootData = newStateData;
    } else {
      console.warn('⚠️ Invalid root structure for differential update');
      return false;
    }
    
    if (!rootData.children || !Array.isArray(rootData.children)) {
      console.warn('⚠️ Invalid children structure for differential update');
      return false;
    }
    
    // Check if we can handle all node types in the new state
    const unsupportedTypes = new Set<string>();
    
    function checkNodeSupport(nodeData: any): boolean {
      const type = nodeData.type;
      if (!canCreateNodeType(type) && !isDecoratorNodeType(type)) {
        unsupportedTypes.add(type);
        return false;
      }
      
      if (nodeData.children && Array.isArray(nodeData.children)) {
        return nodeData.children.every(checkNodeSupport);
      }
      
      return true;
    }
    
    const allSupported = rootData.children.every(checkNodeSupport);
    
    if (!allSupported) {
      console.warn(`⚠️ Unsupported node types detected: ${Array.from(unsupportedTypes).join(', ')}`);
      console.warn('⚠️ Falling back to setEditorState for full compatibility');
      return false;
    }
    
    // Apply differential update within editor transaction
    let updateSuccess = false;
    
    editor.update(() => {
      const root = $getRoot();
      
      // Update root properties if they differ
      if (rootData.direction !== undefined && root.getDirection() !== rootData.direction) {
        root.setDirection(rootData.direction);
      }
      if (rootData.format !== undefined && root.getFormat() !== rootData.format) {
        root.setFormat(rootData.format);
      }
      if (rootData.indent !== undefined && root.getIndent() !== rootData.indent) {
        root.setIndent(rootData.indent);
      }
      
      // Merge children with preservation of decorator nodes
      const hasChanges = mergeChildren(root, rootData.children);
      
      if (hasChanges) {
        console.log(`✅ Applied differential update from ${source}`);
      } else {
        console.log(`ℹ️ No changes needed for update from ${source}`);
      }
      
      updateSuccess = true;
    }, { tag: `diff-merge-${source}` });
    
    return updateSuccess;
    
  } catch (error) {
    console.error(`❌ Error in differential update from ${source}:`, error);
    return false;
  }
}
