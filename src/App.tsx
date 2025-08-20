import { useState, useCallback } from 'react'
import { TextAreaCollaborativeEditor } from './TextAreaCollaborativeEditor'
import { LexicalCollaborativeEditor } from './LexicalCollaborativeEditor'
import { ServerSelector } from './ServerSelector'

import './App.css'

type TabType = 'textarea' | 'lexical';

type ServerType = 'nodejs' | 'python';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('lexical')
  const [selectedServer, setSelectedServer] = useState<ServerType>('python')
  const [isConnected, setIsConnected] = useState(false)
  
  // Determine WebSocket URL based on selected server
  const websocketUrl = selectedServer === 'nodejs' ? 'ws://localhost:8080' : 'ws://localhost:8081'
  
  const handleServerChange = (server: ServerType) => {
    if (!isConnected) {
      setSelectedServer(server)
    }
  }

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected)
  }, [])

  return (
    <div className="App">
      <header className="app-header">
        <h1>Loro CRDT Real-time Collaborative Editors</h1>
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
              onClick={() => setActiveTab('textarea')}
            >
              📝 Simple Text Editor
            </button>
            <button 
              className={`tab-button ${activeTab === 'lexical' ? 'active' : ''}`}
              onClick={() => setActiveTab('lexical')}
            >
              ✨ Rich Text Editor (Lexical)
            </button>
          </div>
          
          <div className="tab-content">
            {activeTab === 'textarea' && (
              <TextAreaCollaborativeEditor
                websocketUrl={websocketUrl}
                onConnectionChange={handleConnectionChange}
              />
            )}
            {activeTab === 'lexical' && (
              <LexicalCollaborativeEditor 
                websocketUrl={websocketUrl} 
                onConnectionChange={handleConnectionChange}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
