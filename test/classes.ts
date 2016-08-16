/**
 * TODO move all of these to factory calls.
 */
import AsyncMachine, {
    factory
} from '../src/asyncmachine';
import { IState } from '../src/types'

class FooMachine extends AsyncMachine {
    A: IState = {};
    B: IState = {};
    C: IState = {};
    D: IState = {};

    constructor(initialState?) {
        super();

        this.register("A", "B", "C", "D");
        if (initialState) {
            this.set(initialState);
        }
    }
}

class EventMachine extends FooMachine {

    TestNamespace: IState = {}

    constructor(initial?, config?) {
        super();
        this.register("TestNamespace");
        if (initial) {
            this.set(initial);
        }
    }
}

class Sub extends AsyncMachine {

    A: IState = {}
    B: IState = {}

    constructor(initial?, a_spy?, b_spy?) {
        super();

        this.register("A", "B");
        this.A_enter = a_spy;
        this.B_enter = b_spy;
        if (initial) {
            this.set(initial);
        }
    }

    A_enter() {

    }

    B_enter() {

    }
}

class SubCrossBlockedByImplied extends AsyncMachine {
    A: IState = {
        drop: ["B"]
    };
    B: IState = {
        drop: ["A"]
    };
    C: IState = {
        add: ["B"]
    };
    constructor() {
        super();

        this.register("A", "B", "C");
        this.set("C");
    }
}

class CrossBlocked extends AsyncMachine {

    A: IState = {
        drop: ["B"]
    }
    B: IState = {
        drop: ["A"]
    }

    constructor() {
        super();

        this.register("A", "B");
        this.set("A");
        this.set("B");
    }
}

export {
    FooMachine,
    EventMachine,
    Sub,
    SubCrossBlockedByImplied,
    CrossBlocked
}
