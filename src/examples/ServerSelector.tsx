/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import React from 'react';
import './ServerSelector.css';

interface ServerSelectorProps {
  currentServer: 'nodejs' | 'python' | 'python-minimal';
  onServerChange: (server: 'nodejs' | 'python' | 'python-minimal') => void;
  isConnected: boolean;
}

export const ServerSelector: React.FC<ServerSelectorProps> = ({
  currentServer,
  onServerChange,
  isConnected
}) => {
  return (
    <div className="server-selector">
      <h3>🔗 Server Selection</h3>
      <div className="server-options">
        <label className={`server-option ${currentServer === 'nodejs' ? 'active' : ''}`}>
          <input
            type="radio"
            name="server"
            value="nodejs"
            checked={currentServer === 'nodejs'}
            onChange={() => onServerChange('nodejs')}
            disabled={isConnected}
          />
          <div className="server-info">
            <span className="server-name">Node.js Server</span>
            <span className="server-url">ws://localhost:8080</span>
            <span className="server-tech">TypeScript + ws</span>
          </div>
        </label>
        
        <label className={`server-option ${currentServer === 'python-minimal' ? 'active' : ''}`}>
          <input
            type="radio"
            name="server"
            value="minimal"
            checked={currentServer === 'python-minimal'}
            onChange={() => onServerChange('python-minimal')}
            disabled={isConnected}
          />
          <div className="server-info">
            <span className="server-name">Python Server (Minimal)</span>
            <span className="server-url">ws://localhost:8082</span>
            <span className="server-tech">Clean Separation Demo</span>
          </div>
        </label>

        <label className={`server-option ${currentServer === 'python' ? 'active' : ''}`}>
          <input
            type="radio"
            name="server"
            value="python"
            checked={currentServer === 'python'}
            onChange={() => onServerChange('python')}
            disabled={isConnected}
          />
          <div className="server-info">
            <span className="server-name">🎯 Python Server</span>
            <span className="server-url">ws://localhost:8081</span>
            <span className="server-tech">Python + loro-py</span>
          </div>
        </label>
        
      </div>
      
      {isConnected && (
        <p className="connection-notice">
          📡 Disconnect to switch servers
        </p>
      )}
    </div>
  );
};
