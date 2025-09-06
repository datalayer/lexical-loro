/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useState, useCallback } from 'react'
import { TextAreaCollaborativeEditor } from './TextAreaCollaborativeEditor'
import { LexicalCollaborativeEditor } from './LexicalCollaborativeEditor'
import { LexicalCollaborativeEditorV2 } from './LexicalCollaborativeEditorV2'
import { ServerSelector } from './ServerSelector'

import './App.css'

type TabType = 'textarea' | 'lexical' | 'lexical-v2';

type ServerType = 'nodejs' | 'python' | 'python-minimal';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('lexical-v2')
  const [selectedServer, setSelectedServer] = useState<ServerType>('python')
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Determine WebSocket URL based on selected server and active tab
  const getWebsocketUrl = () => {
    if (activeTab === 'lexical-v2') {
      // V2 tab always uses the V2 server (port 8082)
      return 'ws://localhost:8082'
    }
    
    // V1 tabs use the selected server
    return selectedServer === 'nodejs' 
      ? 'ws://localhost:8080' 
      : selectedServer === 'python-minimal'
      ? 'ws://localhost:8082'
      : 'ws://localhost:8081'
  }
  
  const websocketUrl = getWebsocketUrl()
  
  const handleServerChange = (server: ServerType) => {
    if (!isConnected) {
      setSelectedServer(server)
      setIsInitialized(false) // Reset initialization when changing servers
    }
  }

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected)
  }, [])

  const handleInitializationChange = useCallback((initialized: boolean) => {
    setIsInitialized(initialized)
  }, [])

  return (
    <div className="App">
      <header className="app-header">
        <h1>
          Loro CRDT Real-time Collaborative Editors
          {isInitialized ? (
            <span style={{ marginLeft: '10px', fontSize: '0.7em' }} title="Initial content loaded successfully">
              ✅
            </span>
          ) : (
            <span style={{ marginLeft: '10px', fontSize: '0.7em' }} title="Loading initial content...">
              ⏳
            </span>
          )}
        </h1>
        <p>Choose between Node.js or Python servers, and simple text area or rich text Lexical editor - all powered by Loro CRDT</p>
        <p><strong>V2 Editor:</strong> Uses incremental updates on Python V2 server (port 8082) to prevent decorator node reloading</p>
      </header>
      
      <main>
        <ServerSelector 
          currentServer={selectedServer}
          onServerChange={handleServerChange}
          isConnected={isConnected}
        />
        
        {activeTab === 'lexical-v2' && (
          <div style={{ 
            padding: '10px', 
            backgroundColor: '#e3f2fd', 
            border: '1px solid #2196f3', 
            borderRadius: '4px', 
            marginBottom: '20px' 
          }}>
            <strong>🚀 V2 Mode:</strong> This tab uses the Python V2 server (ws://localhost:8082) 
            with incremental updates. Server selection above only affects V1 tabs.
          </div>
        )}
        
        <div className="editor-tabs">
          <div className="tab-buttons">
            <button 
              className={`tab-button ${activeTab === 'textarea' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('textarea')
                setIsInitialized(false) // Reset initialization when changing tabs
              }}
            >
              📝 Simple Text Editor
            </button>
            <button 
              className={`tab-button ${activeTab === 'lexical' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('lexical')
                setIsInitialized(false) // Reset initialization when changing tabs
              }}
            >
              ✨ Rich Text Editor (V1)
            </button>
            <button 
              className={`tab-button ${activeTab === 'lexical-v2' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('lexical-v2')
                setIsInitialized(false) // Reset initialization when changing tabs
              }}
            >
              🚀 Rich Text Editor (V2)
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'textarea' && (
              <TextAreaCollaborativeEditor
                websocketUrl={websocketUrl}
                onConnectionChange={handleConnectionChange}
                onInitialization={handleInitializationChange}
              />
            )}
            {activeTab === 'lexical' && (
              <LexicalCollaborativeEditor
                websocketUrl={websocketUrl}
                onConnectionChange={handleConnectionChange}
                onInitialization={handleInitializationChange}
              />
            )}
            {activeTab === 'lexical-v2' && (
              <LexicalCollaborativeEditorV2
                onConnectionChange={handleConnectionChange}
                onInitialization={handleInitializationChange}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
