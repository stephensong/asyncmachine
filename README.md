# AsyncMachine

**Hybrid State Machine** - a loose combination of the following concepts:
- Actor Model
- Declarative Dependency Graph
- Non-Deterministic Automaton
- Async Control Flow
- Declarative Scheduler
- State Manager
- Event Stream Processor
- Aspect Oriented Programming

## Install

```
npm i asyncmachine
```

## Basic example

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

**Live and inspectable version** available on [stackblitz](https://stackblitz.com/edit/asyncmachine-example?file=index.ts).

[![example](https://raw.githubusercontent.com/TobiaszCudnik/asyncmachine/gh-pages/images/example.gif)](https://stackblitz.com/edit/asyncmachine-example?file=index.ts)

For a real world usage example check [GTD bot](https://github.com/TobiaszCudnik/gtd-bot/tree/master/src) (sync engine for Google APIs).

## [API docs](https://tobiaszcudnik.github.io/asyncmachine/)

- [machine() factory](https://tobiaszcudnik.github.io/asyncmachine/index.html#machine)
- [AsyncMachine class](https://tobiaszcudnik.github.io/asyncmachine/classes/asyncmachine.html)
- [Transition class](https://tobiaszcudnik.github.io/asyncmachine/classes/transition.html)
- [List of emitted events](https://tobiaszcudnik.github.io/asyncmachine/interfaces/iemit.html)

## Features
 
- relations between states
- multiple states active simultaneously
- auto states
- transitions defined as class methods
- state negotiation phase
- state clocks
- state piping between machines
- nested transitions queuing
- exception is a state
- compatible with promises, callbacks and emitters
- expressive logging system
- [inspector / debugger available](https://github.com/TobiaszCudnik/asyncmachine-inspector)
- OOP and functional APIs
- TypeScript types generator
 
## What for?

- easy state management
- async operations as a state
- solving non-linear problems
- fault tolerance
- convenient resource disposal
- avoiding race conditions

## State definition

```typescript
interface IState {
    // Tries to activate the listed states along with itself
    add?: string[];
    // Prevents from activating or de-activates the listed states
    drop?: string[];
    // States required for this one to be activated
    require?: string[];
    // State will try to activate itself every time the state of the machine changes
    auto?: boolean;
    // Multi state always triggers "enter" and "state" transitions, plus
    // the clock is always incremented
    multi?: boolean;
    // Transition method of this state will be executed after the listed states
    after?: string[];
}
```

## Transitions
 
Order of transition methods for a sample transition `A -> B`.

All **methods** and **events** with the following names will be called (when defined):

- `A_exit`
- `A_B`
- `A_any`
- `any_B`
- `B_enter`
- `A_end`
- `B_state`

## License

MIT
