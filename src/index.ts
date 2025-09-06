/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

// Main collaboration plugin (following YJS pattern)
export { LoroCollaborationPlugin } from "./LoroCollaborationPlugin";

// Context and hooks (following YJS pattern)
export { 
  LoroCollaborationContext,
  useLoroCollaborationContext,
  type LoroCollaborationContextType 
} from "./LoroCollaborationContext";

export {
  useLoroCollaboration,
  useLoroFocusTracking, 
  useLoroHistory,
  type LoroCursorsContainerRef,
  type SyncLoroCursorPositionsFn
} from "./useLoroCollaboration";

// Legacy plugin (deprecated)
export { 
  LoroCollaborativePlugin as LoroCollaborativePluginV2,
  type PeerInfo,
  type LoroProviderFactory,
  type InitialEditorStateType
} from "./LoroCollaborativePluginV2";

// Core collaboration architecture
export * from "./collaboration";
