import React, { useState, useEffect } from 'react';
import type { Binding } from '../Bindings';

export interface LoroCollaboratorsProps {
  binding: Binding;
  currentUserName?: string;
  currentUserColor?: string;
}

export function LoroCollaborators({ 
  binding, 
  currentUserName = 'Me',
  currentUserColor = '#007acc'
}: LoroCollaboratorsProps): JSX.Element {
  // Force re-render when cursors change
  const [updateTrigger, setUpdateTrigger] = useState(0);
  
  // Monitor cursors map changes
  useEffect(() => {
    const interval = setInterval(() => {
      setUpdateTrigger(prev => prev + 1);
    }, 1000); // Check for updates every second
    
    return () => clearInterval(interval);
  }, []);
  
  // Get current user's client ID
  const currentClientID = binding.clientID;
  
  // Debug: Log cursor information
  const allCursorsDebug = Array.from(binding.cursors.entries()).map(([id, cursor]) => ({
    clientId: id,
    name: cursor.name,
    color: cursor.color,
    isCurrentUser: id === currentClientID
  }));
  
  // Get all collaborators including current user
  const allCollaborators = Array.from(binding.cursors.entries())
    .map(([clientId, cursor]) => ({ clientId, cursor, isCurrentUser: clientId === currentClientID }));

  // Get current user's cursor if it exists
  const currentUserCursor = binding.cursors.get(currentClientID);
  const currentDisplayColor = currentUserCursor?.color || currentUserColor;
  const currentDisplayName = currentUserCursor?.name || currentUserName;

  // Separate current user and others for display order (current user first)
  const currentUserData = allCollaborators.find(({ isCurrentUser }) => isCurrentUser);
  const otherCollaborators = allCollaborators.filter(({ isCurrentUser }) => !isCurrentUser);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #e1e5e9',
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      gap: '8px',
      flexWrap: 'wrap'
    }}>
      {/* Current User (if they have a cursor) */}
      {currentUserData && (
        <CollaboratorBadge
          name={`${currentUserData.cursor.name}`}
          color={currentDisplayColor}
          isCurrentUser={true}
          clientId={currentClientID}
        />
      )}

      {/* Show current user even if no cursor data yet */}
      {!currentUserData && (
        <CollaboratorBadge
          name={`${currentDisplayName} (Me)`}
          color={currentDisplayColor}
          isCurrentUser={true}
          clientId={currentClientID}
        />
      )}

      {/* Separator if there are other collaborators */}
      {otherCollaborators.length > 0 && (
        <div style={{
          width: '1px',
          height: '20px',
          backgroundColor: '#d1d5db',
          margin: '0 4px'
        }} />
      )}

      {/* Other Collaborators */}
      {otherCollaborators.map(({ clientId, cursor }) => (
        <CollaboratorBadge
          key={clientId}
          name={cursor.name}
          color={cursor.color}
          isCurrentUser={false}
          clientId={clientId}
        />
      ))}

      {/* Show count if no active collaborators */}
      {otherCollaborators.length === 0 && (
        <span style={{
          color: '#6b7280',
          fontStyle: 'italic',
          marginLeft: '8px'
        }}>
          No other collaborators
        </span>
      )}
    </div>
  );
}

interface CollaboratorBadgeProps {
  name: string;
  color: string;
  isCurrentUser: boolean;
  clientId: number;
}

function CollaboratorBadge({ name, color, isCurrentUser, clientId }: CollaboratorBadgeProps): JSX.Element {
  // Convert color to rgba for transparency when current user
  const getColorWithOpacity = (color: string, opacity: number = 1): string => {
    // If it's a hex color, convert to rgba
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // If it's already rgba or rgb, just return as is (basic support)
    return color;
  };

  const circleColor = isCurrentUser ? getColorWithOpacity(color, 0.1) : color;
  const badgeColor = isCurrentUser ? getColorWithOpacity(color, 0.1) : color;

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}
      title={`${name} (Client ID: ${clientId})`} // Tooltip with client ID
    >
      {/* Color indicator circle */}
      <div style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: circleColor,
        border: isCurrentUser ? '2px solid #ffffff' : 'none',
        boxShadow: isCurrentUser ? '0 0 0 1px #d1d5db' : 'none',
        flexShrink: 0
      }} />
      
      {/* Name badge */}
      <span style={{
        backgroundColor: badgeColor,
        color: '#ffffff',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        lineHeight: '1.2',
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
        boxShadow: isCurrentUser 
          ? '0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)' 
          : '0 1px 2px rgba(0,0,0,0.1)',
        opacity: isCurrentUser ? 0.9 : 1
      }}>
        {name}
      </span>
    </div>
  );
}

export default LoroCollaborators;