/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {EditorThemeClasses} from 'lexical';

import './StickyEditorTheme.css';

import baseTheme from './PlaygroundEditorTheme';

const theme: EditorThemeClasses = {
  ...baseTheme,
  paragraph: 'StickyEditorTheme__paragraph',
};

export default theme;
