/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { JSX } from 'react';
import React from 'react';
import type { Binding } from '../Bindings';
import { LoroCollaborators } from './LoroCollaborators';

export interface LoroCollaborationUIProps {
  binding: Binding;
  cursorsContainer: JSX.Element | null;
  currentUserName?: string;
  currentUserColor?: string;
  showCollaborators?: boolean;
}

/**
 * Combines the cursors container with the collaborators list
 */
export function LoroCollaborationUI({
  binding,
  cursorsContainer,
  currentUserName = 'You',
  currentUserColor,
  showCollaborators = true
}: LoroCollaborationUIProps): JSX.Element {
  return (
    <>
      {/* Collaborators list at the top */}
      {showCollaborators && (
        <LoroCollaborators
          binding={binding}
          currentUserName={currentUserName}
          currentUserColor={currentUserColor}
        />
      )}
      
      {/* Cursors container for in-editor cursors */}
      {cursorsContainer}
    </>
  );
}

export default LoroCollaborationUI;