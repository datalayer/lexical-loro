/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { useState, useCallback } from 'react'
import { TextAreaCollaborativeEditor } from './TextAreaCollaborativeEditor'
import { LexicalCollaborativeEditor } from './LexicalCollaborativeEditor'
import { ServerSelector } from './ServerSelector'

import './App.css'

type TabType = 'textarea' | 'lexical';

type ServerType = 'nodejs' | 'python' | 'python-minimal';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('lexical')
  const [selectedServer, setSelectedServer] = useState<ServerType>('python')
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Determine WebSocket URL based on selected server
  const websocketUrl = selectedServer === 'nodejs' 
    ? 'ws://localhost:8080' 
    : selectedServer === 'python-minimal'
    ? 'ws://localhost:8082'
    : 'ws://localhost:8081'
  
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
      </header>
      
      <main>
        <ServerSelector 
          currentServer={selectedServer}
          onServerChange={handleServerChange}
          isConnected={isConnected}
        />
        
        <div className="editor-tabs">
          <div className="tab-buttons">
            <button 
              className={`tab-button ${activeTab === 'textarea' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('textarea')
                setIsInitialized(false) // Reset initialization when changing tabs
              }}
            >
              📝 Text Editor
            </button>
            <button 
              className={`tab-button ${activeTab === 'lexical' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('lexical')
                setIsInitialized(false) // Reset initialization when changing tabs
              }}
            >
              ✨ Lexical Editor
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
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
