/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {
  type ShowFlashMessage,
  useFlashMessageContext,
} from '../context/FlashMessageContext';

export default function useFlashMessage(): ShowFlashMessage {
  return useFlashMessageContext();
}
