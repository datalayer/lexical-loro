import { Binding } from '../Bindings';
import { Provider } from '../State';

/**
 * Base interface for all diff handlers
 */
export interface BaseDiffHandler<T = any> {
  /**
   * Handle the diff event
   * @param diff The diff event to handle
   * @param binding The binding instance
   * @param provider The provider instance
   */
  handle(diff: T, binding: Binding, provider: Provider): void;
}