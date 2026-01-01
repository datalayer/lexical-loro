/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {JSX} from 'react';

import * as React from 'react';

export default function DocsPlugin(): JSX.Element {
  return (
    <a target="__blank" href="https://lexical.dev/docs/intro">
      <button
        id="docs-button"
        className="editor-dev-button"
        title="Lexical Docs"
      />
    </a>
  );
}
