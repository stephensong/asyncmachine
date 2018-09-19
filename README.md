**AsyncMachine** is a relational state machine made for declarative flow control. It supports multiple states simultaneously, executes methods based on a dependency graph and provides an event emitter.

It allows for easy:

* state management
* parallel tasks
* loose coupling
* resource allocation / disposal
* exception handling
* fault tolerance
* method cancellation

It supports forming a network of state machines and can also be used as a simple state management library. Gzipped code is 7.5kb.

## Install

```
npm i asyncmachine
```

## Documentation

* [AsyncMachine - The Definitive Guide](https://github.com/TobiaszCudnik/asyncmachine/wiki/AsyncMachine-The-Definitive-Guide) (wiki)<br>
  [PDF version](https://github.com/TobiaszCudnik/asyncmachine/raw/gh-pages/AsyncMachine-The-Definitive-Guide.pdf) (25 pages, 1.5mb)
* [API docs](https://tobiaszcudnik.github.io/asyncmachine/api) (TypeScript)
  * [machine() factory](https://tobiaszcudnik.github.io/asyncmachine/api/index.html#machine)
  * [AsyncMachine class](https://tobiaszcudnik.github.io/asyncmachine/api/classes/asyncmachine.html)
  * [Transition class](https://tobiaszcudnik.github.io/asyncmachine/api/classes/transition.html)
  * [List of emitted events](https://tobiaszcudnik.github.io/asyncmachine/api/interfaces/iemit.html)
* [Roadmap](https://github.com/TobiaszCudnik/asyncmachine/blob/master/TODO.md)

Components:

* states
* transitions
* relations
* clocks
* pipes
* queues

Features:

* synchronous mutations
* negotiation
* cancellation
* automatic states
* exception handling
* [visual inspector / debugger](https://github.com/TobiaszCudnik/asyncmachine-inspector)

## Examples

### Dry Wet

This basic examples makes use of: `states`, `transitions`, `relations` and `synchronous mutations`.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1edd421eaec500126c11ce)
* [Inspect on StackBlitz](https://stackblitz.com/edit/asyncmachine-example-dry-wet?file=index.ts)

```typescript
import { machine } from 'asyncmachine'
// define
const state = {
  Wet: { require: ['Water'] },
  Dry: { drop: ['Wet'] },
  Water: { add: ['Wet'], drop: ['Dry'] }
}
// initialize
const example = machine(state)
// make changes
example.add('Dry')
example.add('Water')
// check the state
example.is() // -> [ 'Wet', 'Water' ]
```

[![example](https://raw.githubusercontent.com/TobiaszCudnik/asyncmachine/gh-pages/images/example.gif)](https://stackblitz.com/edit/asyncmachine-example-dry-wet?file=index.ts)

### Negotiation

Presents how the `state negotiation` works.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1ed850c6dc1f0012db1346)
* [Inspect on StackBlitz](https://stackblitz.com/edit/asyncmachine-example-negotiation?file=index.ts)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine/tree/master/examples/negotiation)

### Async Dialog

Presents the following concepts: `automatic states`, `synchronous mutations`, `delayed mutations` and loose coupling.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1ede5f62717e0013877cdc)
* [Inspect on StackBlitz](https://stackblitz.com/edit/asyncmachine-example-async-dialog?file=index.ts)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine/tree/master/examples/async-dialog)

### Exception State

A simple fault tolerance (retrying) using the `Exception` state.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1ee7113321180012ebafcf)
* [Inspect on Stackblitz](https://stackblitz.com/edit/asyncmachine-example-exception?file=index.ts)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine/tree/master/examples/exception-state)

### Piping

Shows how `pipes` forward states between machines.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1eea671eaec500126c1be7)
* [Inspect on Stackblitz](https://stackblitz.com/edit/asyncmachine-example-piping?file=index.ts)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine/tree/master/examples/piping)

### Transitions

Shows various types of `transition handlers` and the way params get passed to them.

* [Edit on RunKit](https://runkit.com/tobiaszcudnik/5b1eeaba3b97b60012c83ec0)
* [Inspect on Stackblitz](https://stackblitz.com/edit/asyncmachine-example-transitions?file=index.ts)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine/tree/master/examples/transitions)

### TodoMVC and React

Classic TodoMCV example using **AsyncMachine** as the controller and **React** as the view.

* [Edit on Stackblitz](https://stackblitz.com/edit/asyncmachine-example-todomvc?file=src/controller.js)
* [Source on GitHub](https://github.com/TobiaszCudnik/todomvc-asyncmachine)

### State streams with RxJS

Observe state changes and navigate through specific paths with RxJS, then feed the result back as a state.

* Comming soon!

### Restaurant

A complex example showing how to solve the **producer / consumer problem** using AsyncMachine.

* [Inspect on StackBlitz](https://stackblitz.com/edit/asyncmachine-inspector-restaurant)
* [Source on GitHub](https://github.com/TobiaszCudnik/asyncmachine-inspector/tree/master/examples/restaurant)

[![inspector view](https://raw.githubusercontent.com/TobiaszCudnik/asyncmachine/gh-pages/images/restaurant.png)](https://stackblitz.com/edit/asyncmachine-inspector-restaurant)

### GTD Bot

For a real world example check [GTD Bot](https://github.com/TobiaszCudnik/gtd-bot/tree/master/src) - a sync engine for Google APIs.

[![Preview](http://tobiaszcudnik.github.io/asyncmachine-inspector/sample.png)](http://tobiaszcudnik.github.io/asyncmachine-inspector/sample.mp4)

## Use cases

* state management
* synchronizing async actions
* solving non-linear problems
* fault tolerance
* resource allocation / disposal
* avoiding race conditions
* thread pools
* sync engines

## License

MIT
