import React from 'react';
import type { Binding, ClientID } from '../Bindings';
import type { CollabCursor } from '../sync/SyncCursors';

export interface LoroCollaboratorsProps {
  binding: Binding;
  currentUserName?: string;
  currentUserColor?: string;
}

export function LoroCollaborators({ 
  binding, 
  currentUserName = 'You',
  currentUserColor = '#007acc'
}: LoroCollaboratorsProps): JSX.Element {
  // Get current user's client ID
  const currentClientID = binding.clientID;
  
  // Get all cursors except the current user's
  const otherCollaborators = Array.from(binding.cursors.entries())
    .filter(([clientId]) => clientId !== currentClientID)
    .map(([clientId, cursor]) => ({ clientId, cursor }));

  // Get current user's cursor if it exists
  const currentUserCursor = binding.cursors.get(currentClientID);
  const currentDisplayColor = currentUserCursor?.color || currentUserColor;
  const currentDisplayName = currentUserCursor?.name || currentUserName;

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
      {/* Current User */}
      <CollaboratorBadge
        name={currentDisplayName}
        color={currentDisplayColor}
        isCurrentUser={true}
      />

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
}

function CollaboratorBadge({ name, color, isCurrentUser }: CollaboratorBadgeProps): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}>
      {/* Color indicator circle */}
      <div style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        backgroundColor: color,
        border: isCurrentUser ? '2px solid #ffffff' : 'none',
        boxShadow: isCurrentUser ? '0 0 0 1px #d1d5db' : 'none',
        flexShrink: 0
      }} />
      
      {/* Name badge */}
      <span style={{
        backgroundColor: color,
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
          : '0 1px 2px rgba(0,0,0,0.1)'
      }}>
        {name}
        {isCurrentUser && (
          <span style={{
            marginLeft: '4px',
            opacity: 0.8,
            fontSize: '11px'
          }}>
            (You)
          </span>
        )}
      </span>
    </div>
  );
}

export default LoroCollaborators;