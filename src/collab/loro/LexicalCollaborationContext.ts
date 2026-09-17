/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {createContext, useContext} from 'react';
import type {LoroDoc} from 'loro-crdt';
import {collaboratorColor} from '@datalayer/primer-addons';

export type CollaborationContextType = {
  clientID: number;
  color: string;
  isCollabActive: boolean;
  name: string;
  docMap: Map<string, LoroDoc>;
};

const ANIMAL_NAMES = [
  'Cat', 'Dog', 'Rabbit', 'Frog', 'Fox', 'Hedgehog', 'Pigeon', 'Squirrel', 
  'Bear', 'Tiger', 'Leopard', 'Zebra', 'Wolf', 'Owl', 'Gull', 'Squid',
  'Panda', 'Lion', 'Eagle', 'Shark', 'Dolphin', 'Penguin', 'Koala', 'Kangaroo'
];

/**
 * Generate a deterministic name and color based on a client ID
 * This ensures the same client ID always gets the same name across browser sessions
 */
function generateDeterministicUserData(clientId: number): { name: string; color: string } {
  // Use clientId as seed for deterministic selection
  const nameIndex = Math.abs(clientId) % ANIMAL_NAMES.length;
  
  // Add a short ID suffix for uniqueness in case of collisions  
  const shortId = Math.abs(clientId).toString().slice(-4);
  const name = `${ANIMAL_NAMES[nameIndex]}-${shortId}`;
  // The colour is the theme's, picked by the name: the same one every peer
  // and every surface on the page gives this collaborator.
  const color = collaboratorColor(name);
  
  return { name, color };
}

// Use a temporary fallback for initial context (will be updated when client connects)
const fallbackUserData = generateDeterministicUserData(Math.floor(Math.random() * 100000));

export const CollaborationContext = createContext<CollaborationContextType>({
  clientID: 0,
  color: fallbackUserData.color,
  isCollabActive: false,
  name: fallbackUserData.name,
  docMap: new Map(),
});

export { generateDeterministicUserData };

export function useCollaborationContext(
  username?: string,
  color?: string,
): CollaborationContextType {
  const collabContext = useContext(CollaborationContext);

  if (username != null) {
    collabContext.name = username;
  }

  if (color != null) {
    collabContext.color = color;
  }

  return collabContext;
}
