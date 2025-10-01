/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {createContext, useContext} from 'react';
import type {LoroDoc} from 'loro-crdt';

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

const COLORS = [
  'rgb(125, 50, 0)', 'rgb(100, 0, 0)', 'rgb(150, 0, 0)', 'rgb(200, 0, 0)', 
  'rgb(200, 75, 0)', 'rgb(0, 75, 0)', 'rgb(0, 125, 0)', 'rgb(75, 100, 0)',
  'rgb(125, 100, 0)', 'rgb(0, 0, 150)', 'rgb(0, 0, 200)', 'rgb(0, 0, 250)',
  'rgb(0, 100, 150)', 'rgb(0, 100, 100)', 'rgb(100, 0, 100)', 'rgb(150, 0, 150)',
  'rgb(255, 99, 71)', 'rgb(60, 179, 113)', 'rgb(30, 144, 255)', 'rgb(255, 165, 0)',
  'rgb(138, 43, 226)', 'rgb(255, 20, 147)', 'rgb(0, 191, 255)', 'rgb(50, 205, 50)'
];

/**
 * Generate a deterministic name and color based on a client ID
 * This ensures the same client ID always gets the same name across browser sessions
 */
function generateDeterministicUserData(clientId: number): { name: string; color: string } {
  // Use clientId as seed for deterministic selection
  const nameIndex = Math.abs(clientId) % ANIMAL_NAMES.length;
  const colorIndex = Math.abs(clientId) % COLORS.length;
  
  // Add a short ID suffix for uniqueness in case of collisions  
  const shortId = Math.abs(clientId).toString().slice(-4);
  const name = `${ANIMAL_NAMES[nameIndex]}-${shortId}`;
  const color = COLORS[colorIndex];
  
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
