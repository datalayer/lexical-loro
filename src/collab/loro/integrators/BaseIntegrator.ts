/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { Binding } from '../Bindings';
import { Provider } from '../State';

/**
 * Base interface for all diff integrators
 */
export interface BaseIntegrator<T = any> {
  /**
   * Handle the diff event
   * @param diff The diff event to integrate
   * @param binding The binding instance
   * @param provider The provider instance
   */
  integrate(diff: T, binding: Binding, provider: Provider): void;
}