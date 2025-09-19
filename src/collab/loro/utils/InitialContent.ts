import { LoroDoc } from 'loro-crdt';
import { lexicalToLoroTree } from './LexicalToLoro';

/**
 * Initial Lexical JSON structure that matches what the Python server uses
 */
export const INITIAL_LEXICAL_JSON = {
  "root": {
    "children": [
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal",
            "style": "",
            "text": "Lexical with Loro",
            "type": "text",
            "version": 1
          }
        ],
        "direction": null,
        "format": "",
        "indent": 0,
        "type": "heading",
        "version": 1,
        "tag": "h1"
      },
      {
        "children": [
          {
            "detail": 0,
            "format": 0,
            "mode": "normal", 
            "style": "",
            "text": "Type something...",
            "type": "text",
            "version": 1
          }
        ],
        "direction": null,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1,
        "textFormat": 0,
        "textStyle": ""
      }
    ],
    "direction": null,
    "format": "",
    "indent": 0,
    "type": "root",
    "version": 1
  }
};

/**
 * Initialize a new Loro document with the initial Lexical content
 * This ensures consistent starting state across all clients
 */
export function initializeLoroDocWithLexicalContent(doc: LoroDoc): void {
  const tree = doc.getTree('tree');
  tree.enableFractionalIndex(0.001);
  
  // Convert the initial Lexical JSON to Loro tree structure
  lexicalToLoroTree(INITIAL_LEXICAL_JSON, tree);
  
  console.log('🌳 Initialized Loro document with initial Lexical content');
}

/**
 * Check if a Loro document is empty (has no tree content)
 */
export function isLoroDocumentEmpty(doc: LoroDoc): boolean {
  const tree = doc.getTree('tree');
  
  try {
    // Get all root nodes
    const roots = tree.roots();
    // Also check if the document has any nodes at all
    const allNodes = tree.nodes();
    return roots.length === 0 && allNodes.length === 0;
  } catch (error) {
    // If there's an error accessing roots, consider it empty
    return true;
  }
}

/**
 * Check if a Loro document should be initialized (more robust check)
 * This helps prevent race conditions where multiple clients try to initialize
 */
export function shouldInitializeLoroDoc(doc: LoroDoc): boolean {
  const tree = doc.getTree('tree');
  
  try {
    const allNodes = tree.nodes();
    const roots = tree.roots();
    
    // Only initialize if there are truly no nodes
    const isEmpty = allNodes.length === 0;
    
    // Additional check: look for any existing root nodes with our content
    if (!isEmpty) {
      // Check if any root has the expected initial structure
      for (const root of roots) {
        const data = Object.fromEntries(root.data.entries());
        if (data.elementType === 'root') {
          console.log('🌳 Found existing root with content, skipping initialization');
          return false;
        }
      }
    }
    
    return isEmpty;
  } catch (error) {
    console.warn('Error checking if doc should be initialized:', error);
    return false; // Don't initialize if there's an error
  }
}