/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {JSX} from 'react';

import {MarkdownShortcutPlugin} from '@lexical/react/LexicalMarkdownShortcutPlugin';
import * as React from 'react';

import {PLAYGROUND_TRANSFORMERS} from '../MarkdownTransformers';

export default function MarkdownPlugin(): JSX.Element {
  return <MarkdownShortcutPlugin transformers={PLAYGROUND_TRANSFORMERS} />;
}
