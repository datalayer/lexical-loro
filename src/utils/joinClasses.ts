/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

export default function joinClasses(
  ...args: Array<string | boolean | null | undefined>
) {
  return args.filter(Boolean).join(' ');
}
