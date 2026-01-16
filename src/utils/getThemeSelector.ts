/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {EditorThemeClasses} from 'lexical';

export function getThemeSelector(
  getTheme: () => EditorThemeClasses | null | undefined,
  name: keyof EditorThemeClasses,
): string {
  const className = getTheme()?.[name];
  if (typeof className !== 'string') {
    throw new Error(
      `getThemeClass: required theme property ${name} not defined`,
    );
  }
  return className
    .split(/\s+/g)
    .map((cls) => `.${cls}`)
    .join();
}
