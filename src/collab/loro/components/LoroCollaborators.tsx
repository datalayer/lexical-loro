/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { JSX } from 'react';
import React, { useState, useEffect } from 'react';
import type { Binding } from '../Bindings';
import { useCollaboratorColor } from '@datalayer/primer-addons';

export interface LoroCollaboratorsProps {
  binding: Binding;
  currentUserName?: string;
  currentUserColor?: string;
}

export function LoroCollaborators({ 
  binding, 
  currentUserName = 'Me',
  currentUserColor
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
  const currentDisplayName = currentUserCursor?.name || currentUserName;
  // Given no colour, the one the theme's palette picks by name.
  const paletteColor = useCollaboratorColor(currentDisplayName);
  const currentDisplayColor = currentUserCursor?.color || currentUserColor || paletteColor;

  // Separate current user and others for display order (current user first)
  const currentUserData = allCollaborators.find(({ isCurrentUser }) => isCurrentUser);
  const otherCollaborators = allCollaborators.filter(({ isCurrentUser }) => !isCurrentUser);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      backgroundColor: 'var(--bgColor-muted, #f8f9fa)',
      borderBottom: '1px solid var(--borderColor-default, #e1e5e9)',
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      gap: '8px',
      flexWrap: 'wrap',
      color: 'var(--fgColor-default, inherit)',
    }}>
      {/* Current User (if they have a cursor) */}
      {currentUserData && (
        <CollaboratorBadge
          name={`${currentUserData.cursor.name} (me)`}
          color={currentDisplayColor}
          isCurrentUser={true}
          clientId={currentClientID}
        />
      )}

      {/* Show current user even if no cursor data yet */}
      {!currentUserData && (
        <CollaboratorBadge
          name={`${currentDisplayName} (me)`}
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
          backgroundColor: 'var(--borderColor-muted, #d1d5db)',
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
          color: 'var(--fgColor-muted, #6b7280)',
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
  const circleColor = color;
  const badgeColor = color;
  const shortClientId = String(clientId).slice(0, 4);

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
        border: isCurrentUser ? '2px solid var(--bgColor-default, #ffffff)' : 'none',
        boxShadow: isCurrentUser ? '0 0 0 1px var(--borderColor-default, #d1d5db)' : 'none',
        flexShrink: 0
      }} />
      
      {/* Name badge */}
      <span style={{
        backgroundColor: badgeColor,
        color: 'var(--fgColor-onEmphasis, #ffffff)',
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
        opacity: 1
      }}>
        {`${name} ${shortClientId}`}
      </span>
    </div>
  );
}

export default LoroCollaborators;