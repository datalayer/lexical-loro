/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {
  type ShowFlashMessage,
  useFlashMessageContext,
} from '../context/FlashMessageContext';

export default function useFlashMessage(): ShowFlashMessage {
  return useFlashMessageContext();
}
