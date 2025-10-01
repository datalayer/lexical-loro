/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {JSX} from 'react';

import './Dialog.css';

import * as React from 'react';
import {ReactNode} from 'react';

type Props = Readonly<{
  'data-test-id'?: string;
  children: ReactNode;
}>;

export function DialogButtonsList({children}: Props): JSX.Element {
  return <div className="DialogButtonsList">{children}</div>;
}

export function DialogActions({
  'data-test-id': dataTestId,
  children,
}: Props): JSX.Element {
  return (
    <div className="DialogActions" data-test-id={dataTestId}>
      {children}
    </div>
  );
}
