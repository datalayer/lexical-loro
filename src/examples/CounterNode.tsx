import type {LexicalNode} from 'lexical';
import type {JSX} from 'react';

import {
  $getState,
  $setState,
  createState,
  DecoratorNode,
} from 'lexical';
import * as React from 'react';

const CounterComponent = React.lazy(() => import('./CounterComponent'));

export const counterValueState = createState('counterValue', {
  parse: (v) => (typeof v === 'number' ? v : 0),
});

export class CounterNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config('counter', {
      extends: DecoratorNode,
      stateConfigs: [{flat: true, stateConfig: counterValueState}],
    });
  }

  getValue(): number {
    return $getState(this, counterValueState);
  }

  setValue(value: number): this {
    return $setState(this, counterValueState, value);
  }

  increment(): this {
    return $setState(this, counterValueState, prev => prev + 1);
  }

  decrement(): this {
    return $setState(this, counterValueState, prev => prev - 1);
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'counter-node';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <React.Suspense fallback={<div>Loading...</div>}>
        <CounterComponent
          value={this.getValue()}
          nodeKey={this.getKey()}
        />
      </React.Suspense>
    );
  }

  isIsolated(): true {
    return true;
  }
}

export function $isCounterNode(
  node: LexicalNode | null | undefined,
): node is CounterNode {
  return node instanceof CounterNode;
}

export function $createCounterNode(value: number = 0): CounterNode {
  return new CounterNode().setValue(value);
}
