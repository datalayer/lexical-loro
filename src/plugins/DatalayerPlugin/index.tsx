import type {JSX} from 'react';
import { useState, useEffect } from 'react';
import { LexicalEditor, $getRoot, $createTextNode, $createParagraphNode } from 'lexical';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';

interface MCPTool {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}

export default function DatalayerPlugin(): JSX.Element | null {

  const [editor] = useLexicalComposerContext();
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [isLoadingTools, setIsLoadingTools] = useState<boolean>(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // Fetch available MCP tools from the server
  const fetchMCPTools = async () => {
    setIsLoadingTools(true);
    setToolsError(null);
    
    try {
      // Query the MCP server for available tools
      const response = await fetch('http://localhost:3001/tools/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.tools) {
        const tools: MCPTool[] = data.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || {}
        }));
        setMcpTools(tools);
        console.log('Fetched MCP tools:', tools);
      } else {
        throw new Error('Invalid response format from MCP server');
      }
    } catch (error) {
      console.error('Error fetching MCP tools:', error);
      setToolsError(error instanceof Error ? error.message : 'Unknown error occurred');
      // Set some mock tools for development
      setMcpTools([
        { name: 'create_file', description: 'Create a new file in the workspace' },
        { name: 'read_file', description: 'Read contents of a file' },
        { name: 'list_dir', description: 'List directory contents' }
      ]);
    } finally {
      setIsLoadingTools(false);
    }
  };

  // Fetch tools on component mount
  useEffect(() => {
    fetchMCPTools();
  }, []);

  const reloadState = (editor: LexicalEditor) => {
    const state = editor.getEditorState();
    // JSON needs to be parsed to load an new state.
    const newEditorState = editor.parseEditorState(JSON.stringify(state));
    editor.update(() => {
//      editor.setEditorState(state);
      editor.setEditorState(newEditorState);
    });
    console.log(editor.getEditorState().toJSON());
  }

  function addParagraph(editor: LexicalEditor) {
    editor.update(() => {
      const root = $getRoot();
      const timestamp = new Date().toISOString();
      const textNode = $createTextNode(`Hello ${timestamp}`);
      const paragraphNode = $createParagraphNode();
      paragraphNode.append(textNode);
      
      // Insert the paragraph at the beginning of the editor
      const firstChild = root.getFirstChild();
      if (firstChild) {
        firstChild.insertBefore(paragraphNode);
      } else {
        root.append(paragraphNode);
      }
    });
  }

  function first100Keys(editor: LexicalEditor) {
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      const keys: string[] = [];
      
      // Get up to 100 node keys
      const maxNodes = Math.min(100, children.length);
      for (let i = 0; i < maxNodes; i++) {
        keys.push(children[i].getKey());
      }
      
      console.log(`First ${keys.length} node keys:`, keys);
    });
  }

  return (
    <>
      <button onClick={() => {reloadState(editor);}}>Reload State</button>
      <button onClick={() => {addParagraph(editor);}}>Add Paragraph</button>
      <button onClick={() => {first100Keys(editor);}}>100 First keys</button>
      
      <div style={{ marginLeft: '10px', display: 'inline-block' }}>
        <label htmlFor="mcp-tools-select" style={{ marginRight: '5px', fontSize: '12px' }}>
          MCP Tools:
        </label>
        <select 
          id="mcp-tools-select"
          value={selectedTool} 
          onChange={(e) => setSelectedTool(e.target.value)}
          disabled={isLoadingTools}
          style={{ 
            padding: '4px 8px', 
            borderRadius: '4px', 
            border: '1px solid #ccc',
            minWidth: '150px',
            fontSize: '12px'
          }}
        >
          <option value="">
            {isLoadingTools ? 'Loading tools...' : 'Select a tool'}
          </option>
          {mcpTools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name} {tool.description ? `- ${tool.description}` : ''}
            </option>
          ))}
        </select>
        
        {toolsError && (
          <span style={{ 
            marginLeft: '10px', 
            color: 'red', 
            fontSize: '12px' 
          }}>
            Error: {toolsError}
          </span>
        )}
        
        {selectedTool && (
          <span style={{ 
            marginLeft: '10px', 
            color: 'green', 
            fontSize: '12px' 
          }}>
            Selected: {selectedTool}
          </span>
        )}
        
        <button 
          onClick={fetchMCPTools} 
          disabled={isLoadingTools}
          style={{ 
            marginLeft: '5px', 
            padding: '4px 8px', 
            fontSize: '12px' 
          }}
        >
          🔄 Refresh
        </button>
      </div>
    </>
  );
}
