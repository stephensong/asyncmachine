/// <reference path="../typings/eventemitter3-abortable/eventemitter3-abortable.d.ts" />

import { EventEmitter } from "eventemitter3-abortable";

// TODO remove
var __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

// TODO enum
export var STATE_CHANGE = {
    DROP: 0,
    ADD: 1,
    SET: 2
};

// TODO enum
export var STATE_CHANGE_LABELS = {
    0: "Drop",
    1: "Add",
    2: "Set"
};

/**
 * Queue enum defining param positions in queue's entries.
 * TODO enum
 */
export enum QUEUE {
    STATE_CHANGE,
    STATES,
    PARAMS,
    AUTO,
    TARGET
};

export interface IQueueRow {
    0: number;
    1: string[];
    2: any[];
    3?: boolean;
    4?: AsyncMachine;
}

export class Deferred {
    promise: Promise<any>;

    resolve: (...params: any[]) => void;

    reject: (err?) => void;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

/**
 * Base class which you extend with your own one defining the states.
 * The [[Exception]] state is already provided.
 *
 * ```
 * class FooStates extends AsyncMachine
 *   Enabled: {}
 *
 *   Downloading: blocks: 'Downloaded'
 *   Downloaded: blocks: 'Downloading'
 *
 * class Foo
 *   constructor: ->
 *   	this.states = new FooStates this, yes
 *
 *   Downloading_state: (states, @url)
 *   	fetch url, this.states.addByCallack 'Downloaded'
 *
 *   Downloaded_state: (states, local_path) ->
 *   	console.log 'Downloaded #{this.url} to #{local_path}'
 *
 * ```
 * TODO
 * - exposing the current state during transition (via the #duringTransition() method)
 * - loose bind in favor of closures
 */
export class AsyncMachine extends EventEmitter {
    private states_all: string[] = [];

    private states_active: string[] = [];

    // TODO type
    private queue: IQueueRow[] = [];

    private lock: boolean = false;

    public last_promise: Promise<any>;

    private debug_prefix: string = "";

    private debug_level: number = 1;

    private clock_: { [state: string]: number } = {};

    private target: AsyncMachine = null;

    // Events buffer
    private transition_events: any[];

    private debug_: boolean = false;

    piped = {};

    lock_queue = false;

    /**
     * TODO this have to go
     */
    private internal_fields: string[] = ["_events", "states_all", "states_active", "queue", "lock", "last_promise", "debug_prefix", "debug_level", "clock_", "debug_", "target", "internal_fields", "transition_events", "piped"];

    /**
     * Empty Exception state properties. See [[Exception_state]] transition handler.
     */
    Exception = {};

    /**
     * Creates an AsyncMachine instance (not a constructor) with specified states.
     * States properties are empty, so you'd need to set it by yourself.
     *
     * @param states List of state names to register on the new instance.
     * @return
     *
     * ```
     * states = AsyncMachine.factory ['A', 'B','C']
     * states.A = implies: ['B']
     * states.add 'A'
     * states.is() # -> ['A', 'B']
     * ```
     */
    static factory(states, constructor) {
        if (states == null) {
            states = [];
        }
        var instance = new (constructor || AsyncMachine);
        states.forEach((state) => {
            instance[state] = {};
            return instance.register(state);
        });

        return instance;
    }

    /**
     * Creates a new instance with only state one registered, which is the
     * Exception.
     * When extending the class, you should register your states by using either
     * [[registerAll]] or [[register]].
     *
     * @param target Target object for the transitions, useful when composing the
     * 	states instance.
     * @param registerAll Automaticaly registers all defined states.
     * @see [[AsyncMachine]] for the usage example.
     */
    constructor(target : any = null, register_all : any = false) {
        super();

        this.setTarget(target || this);
        if (register_all) {
            this.registerAll();
        } else {
            this.register("Exception");
        }
    }

    /**
     * All exceptions are caught into this state, including both synchronous and
     * asynchronous from promises and callbacks. You can overcreateride it and
     * handle exceptions based on their type and target states of the transition
     * during which they appeared.
     *
     * @param states States to which the machine is transitioning rigt now.
     * 	This means post-exception states.
     * @param err The exception object.
     * @param exception_states Target states of the transition during
     * 	which the exception was thrown.
     * @param async_target_states Only for async transitions like
     * [[addByCallback]], these are states which we're supposed to be set by the
     * callback.
     * @return
     *
     * Example of exception handling
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.Exception_state = (states, err, exception_states) ->
     * 	# Re-adds state 'C' in case of an exception if A is set.
     * 	if exception_states.some((state) -> state is 'C') and @is 'A'
     * 		states.add 'C'
     * ```
     * Example of a manual exception triggering
     * ```
     * states.A_state = (states) ->
     * 	foo = new SomeAsyncTask
     * 	foo.start()
     * 	foo.once 'error', (error) =>
     * 		@add 'Exception', error, states
     * ```
     */
    public Exception_state(states: string[], err: Error, exception_states: string[], async_target_states?: string[]): void {
        console.log("EXCEPTION from AsyncMachine");
        if ((exception_states != null ? exception_states.length : void 0) != null) {
            this.log(("Exception \"" + err + "\" when setting the following states:\n    ") + exception_states.join(", "));
        }
        if ((async_target_states != null ? async_target_states.length : void 0) != null) {
            this.log("Next states were supposed to be (add/drop/set):\n    " + exception_states.join(", "));
        }
        // TODO sometimes err is missing
        console.dir(err);
        return this.setImmediate(() => {
            throw err;
        });
    }

    /**
     * Sets the target for the transition handlers. Useful to keep all you methods in
     * in one class while the states class is composed as an attribute of the main
     * object. There's also a shorthand for this method as
     * [[AsyncMachine.constructor]]'s param.
     *
     * @param target Target object.
     * @return
     *
     * ```
     * class Foo
     * 	constructor: ->
     * 		@states = AsyncMachine.factory ['A', 'B', 'C']
     * 		@states.setTarget this
     * 		@states.add 'A'
     *
     * 	A_state: ->
     * 		console.log 'State A set'
     * ```
     */
    setTarget(target) {
        return this.target = target;
    }

    /**
     * Registers all defined states. Use it only if you don't define any other
     * attributes on the object (or it's prototype). If you do, register the states
     * manually with the [[register]] method. There's also a shorthand for this
     * method as [[AsyncMachine.constructor]]'s param.
     *
     * ```
     * class States extends AsyncMachine
     * 	A: {}
     * 	B: {}
     *
     * class Foo
     * 	constructor: ->
     * 		@states = new States
     * 		@states.registerAll()
     * ```
     */
    public registerAll() {
        var _results;
        var name = "";
        var value = null;
        for (name in this) {
            value = this[name];
            if ((this.hasOwnProperty(name)) && __indexOf.call(this.internal_fields, name) < 0 && !(this[name] instanceof Function)) {
                this.register(name);
            }
        }
        var constructor = this.getInstance().constructor.prototype;
        _results = [];
        while (true) {
            for (name in constructor) {
                value = constructor[name];
                if ((constructor.hasOwnProperty(name)) && __indexOf.call(this.internal_fields, name) < 0 && !(constructor[name] instanceof Function)) {
                    this.register(name);
                }
            }

            constructor = Object.getPrototypeOf(constructor);
            if (constructor === AsyncMachine.prototype) {
                break;
            } else {
                _results.push(void 0);
            }
        }
        return _results;
    }

    /**
     * Returns an array of relations from one state to another.
     * Maximum set is ['blocks', 'drops', 'implies', 'requires'].
     *
     * TODO code sample
     */
    public getRelations(from_state: string, to_state: string): string[] {
        var relations = ["blocks", "drops", "implies", "requires"];
        var state = this.get(from_state);

        return relations.filter((relation) => __indexOf.call(state[relation] != null, to_state) >= 0);
    }

    /**
     * If no states passed, returns all the current states.
     *
     * If states passed, returns a boolean if all of them are set.
     *
     * If only one state is passed, one can assert on a certain tick of the given
     * state (see [[clock]]).
     *
     * @param state One or more state names.
     * @param tick For one state, additionally checks if state's clock is at the same
     * moment.
     * @return
     *
     * ```
     * states = AsyncMachine.factory ['A', 'B']
     * states.add 'A'
     * states.is 'A' # -> true
     * states.is ['A'] # -> true
     * states.is ['A', 'B'] # -> false
     * // assert the tick
     * tick = states.clock 'A'
     * states.drop 'A'
     * states.add 'A'
     * states.is 'A', tick # -> false
     * ```
     */
    public is(states: string | string[], tick?: number): boolean;
    public is(): string[];
    public is(states?: any, tick?: any): any {
        if (!states) {
            return this.states_active;
        }
        let states_parsed = this.parseStates(states)
        var active = states_parsed.every( (state) => {
            return Boolean(~this.states_active.indexOf(states));
        })
        if (!active) {
            return false;
        }
        if (states_parsed.length && tick !== undefined) {
            return this.clock(states) === tick;
        }
        return true;
    }

    /**
     * Checks if any of the passed states is set. State can also be an array, then
     * all states from this param has to be set.
     *
     * @param states State names and/or lists of state names.
     * @return
     *
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add ['A', 'B']
     *
     * states.any 'A', 'C' # -> true
     * states.any ['A', 'C'], 'C' # -> false
     * ```
     */
    public any(...states: string[]): boolean;
    public any(...states: string[][]): boolean;
    public any(...states: any[]): boolean {
        return states.some((name) => {
            if (Array.isArray(name)) {
                return this.every(name);
            } else {
                return this.is(name);
            }
        });
    }

    /**
     * Checks if all the passed states are set.
     *
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add ['A', 'B']
     *
     * states.every 'A', 'B' # -> true
     * states.every 'A', 'B', 'C' # -> false
     * ```
     */
    public every(...states: string[]): boolean {
        return states.every((name) => Boolean(~this.states_active.indexOf(name)));
    }

    /**
     * Returns the current queue. For struct's meaning, see [[QUEUE]].
     */
    public futureQueue(): IQueueRow[] {
        return this.queue;
    }

    /**
     * Register the passed state names. State properties should be already defined.
     *
     * @param states State names.
     * @return
     *
     * ```
     * states = new AsyncMachine
     * states.Enabled = {}
     * states.Disposed = blocks: 'Enabled'
     *
     * states.register 'Enabled', 'Disposed'
     *
     * states.add 'Enabled'
     * states.is() # -> 'Enabled'
     * ```
     */
    public register(...states: string[]) {
        return states.map((state) => {
            if (__indexOf.call(this.states_all, state) < 0) {
                this.states_all.push(state);
            }
            return this.clock_[state] = 0;
        });
    }

    /**
     * Returns state's properties.
     *
     * @param state State name.
     * @return
     *
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.A = blocks: ['B']
     *
     * states.get('A') # -> { blocks: ['B'] }
     * ```
     */
    public get(state: string): IState {
        return this[state];
    }

    /**
     * Sets specified states and deactivate all the other which are currently set.
     *
     * @param target OPTIONAL. Pass it if you want to execute a transition on an
     *   external machine, but using the local queue.
     * @param states Array of state names or a single state name.
     * @param params Params to be passed to the transition handlers (only ones from
     *   the specified states, not implied or auto states).
     * @return Result of the transition. FALSE means that states weren't accepted,
     *   or some of implied or auto states dropped some of the requested states
     *   after the transition.
     *
     * Basic usage
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.set 'A'
     * states.is() # -> ['A']
     * states.set 'B'
     * states.is() # -> ['B']
     * ```
     *
     * State negotiation
     * ```
     * states = AsyncMachine.factory ['A', 'B']
     * # Transition enter negotiation
     * states.A_enter = -> no
     * states.add 'A' # -> false
     * ```
     *
     * Setting a state on an external machine
     * ```
     * states1 = AsyncMachine.factory ['A', 'B']
     * states2 = AsyncMachine.factory ['C', 'D']
     *
     * states1.A_enter ->
     * 	# this transition will be queued and executed after the current transition
     * 	# is fully finished
     * 	states1.add states2, 'B'
     * ```
     */
    public set(target: AsyncMachine, states: string[] | string, ...params: any[]): boolean;
    public set(target: string[] | string, states?: any, ...params: any[]): boolean;
    public set(target: any, states?: any, ...params: any[]): boolean {
        if (!(target instanceof AsyncMachine)) {
            if (states) {
                params = [states].concat(params);
            }
            states = target;
            target = null;
        }

        this.enqueue_(STATE_CHANGE.SET, states, params, target);

        return this.processQueue_();
    }

    /**
     * Deferred version of [[set]], returning a node-style callback for setting
     * the state. Errors are handled automatically and forwarded to the Exception
     * state.
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[set]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * setTimeout states.setByCallback 'B'
     * ```
     *
     */

    public setByCallback(target: AsyncMachine, states: string[], ...params: any[]): (err?: any, ...params) => void;
    public setByCallback(target: AsyncMachine, states: string, ...params: any[]): (err?: any, ...params) => void;
    public setByCallback(target: string[], states?: any, ...params: any[]): (err?: any, ...params) => void;
    public setByCallback(target: string, states?: any, ...params: any[]): (err?: any, ...params) => void;
    public setByCallback(target: any, states?: any, ...params: any[]): (err?: any, ...params) => void {
        return this.createCallback(this.createDeferred(this.set.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[set]], returning a listener for setting
     * the state. Errors need to be handled manually by binding the exception
     * state to the 'error' event (or equivalent).
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[set]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * emitter = new EventEmitter
     * emitter.on 'ready', states.setByListener 'A'
     * emitter.on 'error', states.addByListener 'Exception'
     * ```
     */

    public setByListener(target: AsyncMachine, states: string[], ...params: any[]): (err?: any, ...params) => void;
    public setByListener(target: AsyncMachine, states: string, ...params: any[]): (err?: any, ...params) => void;
    public setByListener(target: string[], states?: any, ...params: any[]): (err?: any, ...params) => void;
    public setByListener(target: string, states?: any, ...params: any[]): (err?: any, ...params) => void;
    public setByListener(target: any, states?: any, ...params: any[]): (err?: any, ...params) => void {
        return this.createListener(this.createDeferred(this.set.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[set]], setting the requested states on the next event
     * loop's tick. Useful if you want to start with a fresh stack trace.
     *
     * See [[set]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.set 'A'
     * states.setNext 'B'
     * states.is() # -> ['A']
     * ```
     */

    public setNext(target: AsyncMachine, states: string, ...params: any[]): (...params) => void;
    public setNext(target: AsyncMachine, states: string[], ...params: any[]): (...params) => void;
    public setNext(target: string, states: any, ...params: any[]): (...params) => void;
    public setNext(target: string[], states: any, ...params: any[]): (...params) => void;
    public setNext(target: any, states: any, ...params: any[]): (...params) => void {
        var fn = this.set.bind(this);
        return this.setImmediate(fn, target, states, params);
    }

    /**
     * Adds specified states to the currently set ones.
     *
     * @param target OPTIONAL. Pass it if you want to execute a transition on an
     *   external machine, but using the local queue.
     * @param states Array of state names or a single state name.
     * @param params Params to be passed to the transition handlers (only ones from
     *   the specified states, not implied or auto states).
     * @return Result of the transition. FALSE means that states weren't accepted,
     *   or some of implied or auto states dropped some of the requested states
     *   after the transition.
     *
     * Basic usage
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add 'A'
     * states.is() # -> ['A']
     * states.add 'B'
     * states.is() # -> ['B']
     * ```
     *
     * State negotiation
     * ```
     * states = AsyncMachine.factory ['A', 'B']
     * # Transition enter negotiation
     * states.A_enter = -> no
     * states.add 'A' # -> false
     * ```
     *
     * Adding a state on an external machine
     * ```
     * states1 = AsyncMachine.factory ['A', 'B']
     * states2 = AsyncMachine.factory ['C', 'D']
     *
     * states1.A_enter ->
     * 	# this transition will be queued and executed after the current transition
     * 	# fully finishes
     * 	states1.add states2, 'B'
     * ```
     */

    public add(target: AsyncMachine, states: string[], ...params: any[]): boolean;
    public add(target: AsyncMachine, states: string, ...params: any[]): boolean;
    public add(target: string[], states?: any, ...params: any[]): boolean;
    public add(target: string, states?: any, ...params: any[]): boolean;
    public add(target: any, states?: any, ...params: any[]): boolean {
        if (!(target instanceof AsyncMachine)) {
            if (states) {
                params = [states].concat(params);
            }
            states = target;
            target = null;
        }

        this.enqueue_(STATE_CHANGE.ADD, states, params, target);

        return this.processQueue_();
    }

    /**
     * Deferred version of [[add]], returning a node-style callback for adding
     * the state. Errors are handled automatically and forwarded to the Exception
     * state.
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[add]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * someNodeCallback 'foo.com', states.addByCallback 'B'
     * ```
     *
     */

    public addByCallback(target: AsyncMachine, states: string[], ...params: any[]): (err?: any, ...params) => void;
    public addByCallback(target: AsyncMachine, states: string, ...params: any[]): (err?: any, ...params) => void;
    public addByCallback(target: string[], states?: any, ...params: any[]): (err?: any, ...params) => void;
    public addByCallback(target: string, states?: any, ...params: any[]): (err?: any, ...params) => void;
    public addByCallback(target: any, states?: any, ...params: any[]): (err?: any, ...params) => void {
        return this.createCallback(this.createDeferred(this.add.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[add]], returning a listener for adding
     * the state. Errors need to be handled manually by binding the exception
     * state to the 'error' event (or equivalent).
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[add]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * emitter = new EventEmitter
     * emitter.on 'ready', states.addByListener 'A'
     * emitter.on 'error', states.addByListener 'Exception'
     * ```
     */

    public addByListener(target: AsyncMachine, states: string[], ...params: any[]): (...params) => void;
    public addByListener(target: AsyncMachine, states: string, ...params: any[]): (...params) => void;
    public addByListener(target: string[], states?: any, ...params: any[]): (...params) => void;
    public addByListener(target: string, states?: any, ...params: any[]): (...params) => void;
    public addByListener(target: any, states?: any, ...params: any[]): (...params) => void {
        return this.createListener(this.createDeferred(this.add.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[add]], adding the requested states on the next event
     * loop's tick. Useful if you want to start with a fresh stack trace.
     *
     * See [[add]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add 'A'
     * states.addNext 'B'
     * states.is() # -> ['A', 'B']
     * ```
     */

    public addNext(target: AsyncMachine, states: string, ...params: any[]): (...params) => void;
    public addNext(target: AsyncMachine, states: string[], ...params: any[]): (...params) => void;
    public addNext(target: string, states: any, ...params: any[]): (...params) => void;
    public addNext(target: string[], states: any, ...params: any[]): (...params) => void;
    public addNext(target: any, states: any, ...params: any[]): (...params) => void {
        var fn = this.add.bind(this);
        return this.setImmediate(fn, target, states, params);
    }

    /**
     * Drops specified states if they are currently set.
     *
     * @param target OPTIONAL. Pass it if you want to execute a transition on an
     *   external machine, but using the local queue.
     * @param states Array of state names or a single state name.
     * @param params Params to be passed to the transition handlers (only ones from
     *   the specified states, not implied or auto states).
     * @return Result of the transition. FALSE means that dropping the states
     *   wasn't accepted, or some of implied or auto states added some of the
     *   requested states after the transition.
     *
     * Basic usage
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.drop 'A'
     * states.is() # -> ['A']
     * states.drop 'B'
     * states.is() # -> ['B']
     * ```
     *
     * State negotiation
     * ```
     * states = AsyncMachine.factory ['A', 'B']
     * # Transition enter negotiation
     * states.A_enter = -> no
     * states.add 'A' # -> false
     * ```
     *
     * Dropping a state on an external machine
     * ```
     * states1 = AsyncMachine.factory ['A', 'B']
     * states2 = AsyncMachine.factory ['C', 'D']
     *
     * states1.A_enter ->
     * 	# this transition will be queued and executed after the current transition
     * 	# fully finishes
     * 	states1.add states2, 'B'
     * ```
     */

    public drop(target: AsyncMachine, states: string[], ...params: any[]): boolean;
    public drop(target: AsyncMachine, states: string, ...params: any[]): boolean;
    public drop(target: string[], states?: any, ...params: any[]): boolean;
    public drop(target: string, states?: any, ...params: any[]): boolean;
    public drop(target: any, states?: any, ...params: any[]): boolean {
        if (!(target instanceof AsyncMachine)) {
            if (states) {
                params = [states].concat(params);
            }
            states = target;
            target = null;
        }

        this.enqueue_(STATE_CHANGE.DROP, states, params, target);

        return this.processQueue_();
    }

    /**
     * Deferred version of [[drop]], returning a node-style callback for dropping
     * the state. Errors are handled automatically and forwarded to the Exception
     * state.
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[drop]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * someNodeCallback 'foo.com', states.dropByCallback 'B'
     * ```
     *
     */

    public dropByCallback(target: AsyncMachine, states: string[], ...params: any[]): (err?: any, ...params) => void;
    public dropByCallback(target: AsyncMachine, states: string, ...params: any[]): (err?: any, ...params) => void;
    public dropByCallback(target: string[], states?: any, ...params: any[]): (err?: any, ...params) => void;
    public dropByCallback(target: string, states?: any, ...params: any[]): (err?: any, ...params) => void;
    public dropByCallback(target: any, states?: any, ...params: any[]): (err?: any, ...params) => void {
        return this.createCallback(this.createDeferred(this.drop.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[drop]], returning a listener for dropping
     * the state. Errors need to be handled manually by binding the exception
     * state to the 'error' event (or equivalent).
     *
     * After the call, the responsible promise object is available as the
     * [[last_promise]] attribute.
     *
     * See [[drop]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * emitter = new EventEmitter
     * emitter.on 'ready', states.dropByListener 'A'
     * emitter.on 'error', states.setByListener 'Exception'
     * ```
     */

    public dropByListener(target: AsyncMachine, states: string[], ...params: any[]): (err?: any, ...params) => void;
    public dropByListener(target: AsyncMachine, states: string, ...params: any[]): (err?: any, ...params) => void;
    public dropByListener(target: string[], states?: any, ...params: any[]): (err?: any, ...params) => void;
    public dropByListener(target: string, states?: any, ...params: any[]): (err?: any, ...params) => void;
    public dropByListener(target: any, states?: any, ...params: any[]): (err?: any, ...params) => void {
        return this.createListener(this.createDeferred(this.drop.bind(this), target, states, params));
    }

    /**
     * Deferred version of [[drop]], dropping the requested states on the next
     * event loop's tick. Useful if you want to start with a fresh stack trace.
     *
     * See [[drop]] for the params description.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add 'A'
     * states.dropNext 'A'
     * states.is('A') # -> true
     * ```
     */

    public dropNext(target: AsyncMachine, states: string, ...params: any[]): (...params) => void;
    public dropNext(target: AsyncMachine, states: string[], ...params: any[]): (...params) => void;
    public dropNext(target: string, states: any, ...params: any[]): (...params) => void;
    public dropNext(target: string[], states: any, ...params: any[]): (...params) => void;
    public dropNext(target: any, states: any, ...params: any[]): (...params) => void {
        var fn = this.drop.bind(this);
        return this.setImmediate(fn, target, states, params);
    }

    /**
     * Pipes (forwards) the state to other instance.
     *
     * Piped are "_state" and "_end" methods, not the negotiation ones
     * (see pipeNegotiation]] for these).
     *
     * @param state Source state's name. Optional - if none is given, all states
     * from the source asyncmachine are piped.
     * @param machine Target machine to which the state(s) should be forwarded.
     * @param target_state If the target state name should be different, this is
     * the name.
     * @param local_queue Append the piped stated transition to the END of the
     *   local queue if one exists at the moment, altering the order of the
     *   transition.
     *
     * Example
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states1.pipe 'A', states2
     * states1.add 'A'
     * states2.is('A') # -> true
     * ```
     */

    public pipe(state: string, machine?: AsyncMachine, target_state?: string, local_queue?: boolean);
    public pipe(state: string[], machine?: AsyncMachine, target_state?: string, local_queue?: boolean);
    public pipe(state: AsyncMachine, machine?: string, target_state?: boolean);
    public pipe(state: any, machine?: any, target_state?: any, local_queue?: any) {
        var bindings = {
            state: "add",
            end: "drop"
        };

        return this.pipeBind(state, machine, target_state, local_queue, bindings);
    }

    /**
     * Pipes (forwards) the state to other instance in an inverted manner.
     *
     * Piped are "_state" and "_end" methods, not the negatiation ones
     * (see pipeNegotiation]] for these).
     *
     * @param state Source state's name. Optional - if none is given, all states
     * from the source asyncmachine are forwarded.
     * @param machine Target machine to which the state(s) should be forwarded.
     * @param target_state If the target state name should be different, this is
     * the name.
     * @param local_queue Append the piped stated to the end of the local queue
     *   if any exists at the moment. This will alter the order of the transition.
     *
     * Example
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states1.pipeInverted 'A', states2
     * states2.is('A') # -> true
     * states1.add 'A'
     * states2.is('A') # -> false
     * ```
     */

    pipeInverted(state, machine, target_state, local_queue) {
        var bindings = {
            state: "drop",
            end: "add"
        };

        return this.pipeBind(state, machine, target_state, local_queue, bindings);
    }

    /**
     * Pipes (forwards) the state to other instance.
     *
     * Piped are "_enter" and "_exit" methods, which returned values can manage
     * the state negotiation, but also can be executed in random order (relatively
     * to other states from the same transition).
     *
     * @param state Source state's name. Optional - if none is given, all states
     * from the source asyncmachine are piped.
     * @param machine Target machine to which the state(s) should be forwarded.
     * @param target_state If the target state name should be different, this is
     * the name.
     * @param local_queue Append the piped stated to the end of the local queue
     *   if any exists at the moment. This will alter the order of the transition.
     *
     * Piping without negotiation
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states1.pipeNegotiation 'A', states2
     * states1.add 'A'
     * states2.is('A') # -> true
     * ```
     *
     * Piping with negotiation
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states2.A_enter = -> no
     * states1.pipeNegotiation 'A', states2
     * states1.add 'A'
     * states2.is('A') # -> false
     * ```
     */

    pipeNegotiation(state, machine, target_state, local_queue) {
        var bindings = {
            enter: "add",
            exit: "drop"
        };

        return this.pipeBind(state, machine, target_state, local_queue, bindings);
    }

    /**
     * Pipes (forwards) the state to other instance in an inverted manner.
     *
     * Piped are "_enter" and "_exit" methods, which returned values can manage
     * the state negotiation, but also can be executed in random order (relatively
     * to other states from the same transition).
     *
     * @param state Source state's name. Optional - if none is given, all states
     * from the source asyncmachine are piped.
     * @param machine Target machine to which the state(s) should be forwarded.
     * @param target_state If the target state name should be different, this is
     * the name.
     * @param local_queue Append the piped stated to the end of the local queue
     *   if any exists at the moment. This will alter the order of the transition.
     *
     * Inverted piping without negotiation
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states1.pipeNegotiationInverted 'A', states2
     * states1.add 'A'
     * states2.is('A') # -> true
     * ```
     *
     * Inverted piping with negotiation
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = AsyncMachine.factory ['A', 'B', 'C']
     * states2.A_enter = -> no
     * states1.pipeNegotiationInverted 'A', states2
     * states1.add 'A'
     * states2.is('A') # -> false
     * ```
     */

    pipeNegotiationInverted(state, machine, target_state, local_queue) {
        var bindings = {
            enter: "drop",
            exit: "add"
        };

        return this.pipeBind(state, machine, target_state, local_queue, bindings);
    }

    public pipeOff(): void {
        throw new Error("not implemented yet");
    }

    /**
     * Returns the current tick of the passed state.
     *
     * State's clock starts with 0 and on each (successful) set it's incremented
     * by 1. Ticks lets you keep control flow's integrity across async listeners,
     * by aborting it once the state had changed. Easiest way to get the tick
     * abort function is to use [[getAbort]].
     *
     * @param state Name of the state
     * @return Current tick of the passed state
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.add 'A'
     * states.add 'A'
     * states.clock('A') # -> 1
     * states.drop 'A'
     * states.add 'A'
     * states.clock('A') # -> 2
     * ````
     */

    clock(state: string): number {
        return this.clock_[state];
    }

    /**
     * Creates a prototype child with dedicated active states, a clock and
     * a queue.
     *
     * Useful for creating new instances of dynamic classes (or factory created
     * instances).
     *
     * @param state Name of the state
     * @return Current tick of the passed state
     *
     * Example
     * ```
     * states1 = AsyncMachine.factory ['A', 'B', 'C']
     * states2 = states1.createChild()
     *
     * states2.add 'A'
     * states2.is() # -> ['A']
     * states1.is() # -> []
     * ````
     */

    createChild(): this {
        var child = Object.create(this);
        var child_states_active = [];
        child.clock = {};
        child.queue = [];
        this.states_all.forEach((state) => child.clock[state] = 0);
        return child;
    }

    /**
     * Indicates if this instance is currently during a state transition.
     *
     * When a machine is during a transition, all state changes will be queued
     * and executed as a queue. See [[queue]].
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     *
     * states.A_enter = ->
     *   @duringTransition() # -> true
     *
     * states.A_state = ->
     *   @duringTransition() # -> true
     *
     * states.add 'A'
     * ````
     */

    public duringTransition(): boolean {
        return this.lock;
    }

    /**
     * Returns the abort function, based on the current [[clock]] tick of the
     * passed state. Optionally allows to compose an existing abort function.
     *
     * The abort function is a boolean function returning TRUE once the flow
     * for the specific state should be aborted, because:
     * -the state has been unset (at least once)
     * -the composed abort function returns TRUE
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     *
     * states.A_state = ->
     *   abort = @getAbort 'A'
     *   setTimeout (->
     *       return if abort()
     *       console.log 'never reached'
     *     ), 0
     *
     * states.add 'A'
     * states.drop 'A'
     * ````
     *
     * TODO support multiple states
     * TODO support default values for state names
     *
     * @param state Name of the state
     * @param abort Existing abort function (optional)
     * @return A new abort function
     */

    public getAbort(state: string, abort?: () => boolean): () => boolean {
        var tick = this.clock(state);

        return this.getAbortFunction(state, tick, abort);
    }

    /**
     * Resolves the returned promise when all passed states are set (at the same
     * time). Accepts an optional abort function.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.when(['A', 'B']).then ->
     *   console.log 'A, B'
     *
     * states.add 'A'
     * states.add('B') # -> prints 'A, B'
     * ````
     *
     * # TODO support push cancellation
     *
     * @param state List of state names
     * @param abort Existing abort function (optional)
     * @return Promise resolved once all states are set concurrently.
     */

    public when(states: string | string[], abort?: Function): Promise<any> {
        let states_parsed = this.parseStates(states)
        return new Promise((resolve, reject) => this.bindToStates(states_parsed, resolve, abort));
    }

    /**
     * Resolves the returned promise when all passed states are set (at the same
     * time), but triggers the listeners only once. Accepts an optional abort
     * function.
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.whenOnce(['A', 'B']).then ->
     *   console.log 'A, B'
     *
     * states.add 'A'
     * states.add('B') # -> prints 'A, B'
     * states.drop 'B'
     * states.add 'B' # listener is already disposed
     * ````
     *
     * # TODO support push cancellation
     *
     * @param state List of state names
     * @param abort Existing abort function (optional)
     * @return Promise resolved once all states are set concurrently.
     */

    public whenOnce(states: string | string[], abort?: Function): Promise<any> {
        let states_parsed = this.parseStates(states)
        return new Promise((resolve, reject) => this.bindToStates(states_parsed, resolve, abort, true));
    }

    /**
     * Enabled debug messages sent to the console. There're 3 log levels:
     *
     * - 1 - displays only the state changes in a diff format
     * - 2 - displays all operations which happened along with refused state
     *   changes
     * - 3 - displays pretty much everything, including all possible operations
     *
     * Example
     * ```
     * states = AsyncMachine.factory ['A', 'B', 'C']
     * states.debug 'FOO ', 1
     * states.add 'A'
     * # -> FOO [add] state Enabled
     * # -> FOO [states] +Enabled
     * ````
     *
     * @param prefix Prefix before all console messages.
     * @param level Error level (1-3).
     */

    debug(prefix : any = "", level : any = 1) {
        this.debug_ = true;
        this.debug_prefix = prefix;
        this.debug_level = level;

        return null;
    }

    public debugOff(): void {
        this.debug_ = false;

        return null;
    }

    /**
     * TODO docs
     * TODO unify event name with transition name (remove the _state suffix if possible)
     */
    public on(event: string, listener: Function, context?: Object): AsyncMachine {
        if (event.slice(-6) === "_state" && this.is(event.slice(0, -6))) {
            this.catchPromise(listener.call(context));
        }

        super.on(event, listener, context);
        return this;
    }

    /**
     * TODO docs
     * TODO unify event name with transition name (remove the _state suffix if possible)
     */

    public once(event: string, listener: Function, context?: Object): AsyncMachine {
        if (event.slice(-6) === "_state" && this.is(event.slice(0, -6))) {
            this.catchPromise(listener.call(context));
        } else {
            super.once(event, listener, context);
        }

        return this;
    }

    /**
     * Bind the Exception state to the promise error handler. Handy when working
     * with promises.
     *
     * See [[Exception_state]].
     *
     * @param promise The promise to handle
     * @param target_states States for which the promise was created (the
     *   one that failed).
     * @return The source promise, for piping.
     */
    public catchPromise(promise: Promise<any>, target_states?: string[]): Promise<any>;
    public catchPromise(promise: any, target_states?: string[]): any {
        if ((promise != null ? promise.then : void 0) && (promise != null ? promise["catch"] : void 0)) {
            promise["catch"]((error) => this.add("Exception", error, target_states));
        }

        return promise;
    }

    /**
     * Diffs two state sets and returns the ones present in the 1st only.
     *
     * @param states1 Source states list.
     * @param states2 Set to diff against (picking up the non existing ones).
     * @return List of states in states1 but not in states2.
     */
    public diffStates(states1: string[], states2: string[]) {
        return states1.filter((name) => __indexOf.call(states2, name) < 0).map((name) => name);
    }

    private log(msg: string, level?: number): void {
        if (level == null) {
            level = 1;
        }
        if (!this.debug_) {
            return;
        }
        if (level > this.debug_level) {
            return;
        }
        return console.log(this.debug_prefix + msg);
    }

    pipeBind(state, machine, target_state, local_queue, bindings) {
        if (state instanceof AsyncMachine) {
            if (target_state == null) {
                target_state = true;
            }
            return this.pipeBind(this.states_all, state, machine, target_state, bindings);
        }

        if (local_queue == null) {
            local_queue = true;
        }

        this.log("Piping state " + state, 3);
        return [].concat(state).forEach((state) => {
            var new_state = target_state || state;

            return Object.keys(bindings).forEach((event_type) => {
                var method_name = bindings[event_type];
                this.piped[state] = {
                    state: new_state,
                    machine: machine
                };
                return this.on(state + "_" + event_type, () => {
                    if (local_queue) {
                        return this[method_name](machine, new_state);
                    } else {
                        return machine[method_name](new_state);
                    }
                });
            });
        });
    }

    /**
     * Override for EventEmitter method calling a specific listener. Binds to
     * a promis if returned by the listener.
     */
    private callListener(listener, context, params): Promise<any>;
    private callListener(listener, context, params): any {
        var ret = listener.apply(context, params);
        return this.catchPromise(ret, params[0]);
    }

    private getInstance(): any {
        return this;
    }

    setImmediate(fn, ...params) {
        if (setImmediate) {
            return setImmediate.apply(null, [fn].concat(params));
        } else {
            return setTimeout(fn.apply(null, params), 0);
        }
    }

    private prepareAutoStates(): IQueueRow {
        var add = [];
        this.states_all.forEach((state) => {
            var is_current = () => this.is(state);
            var is_blocked = () => this.is().some((item) => {
                    if (!(this.get(item)).blocks) {
                        return false;
                    }
                    return Boolean(~(this.get(item)).blocks.indexOf(state));
                });

            if (this[state].auto && !is_current() && !is_blocked()) {
                return add.push(state);
            }
        });

        if (add.length) {
            return [STATE_CHANGE.ADD, add, [], true, null];
        }
    }

    public hasStateChanged(states_before: string[]): boolean {
        var length_equals = this.is().length === states_before.length;

        return !length_equals || Boolean(this.diffStates(states_before, this.is()).length);
    }

    private parseStates(states: string | string[]) {
        var states_parsed = [].concat(states);

        return states_parsed.filter((state) => {
            if (typeof state !== "string" || !this.get(state)) {
                throw new Error("Non existing state: " + state);
            }

            return true;
        });
    }

    private prepareTransitions(type: number, states: string[], params: any[], is_autostate?: boolean): IPreparedTransitions {
        var type_label = STATE_CHANGE_LABELS[type].toLowerCase();
        if (is_autostate) {
            this.log("[" + type_label + "] AUTO state " + (states.join(", ")), 3);
        } else {
            this.log("[" + type_label + "] state " + (states.join(", ")), 2);
        }
        
        let transitions: IPreparedTransitions = {
            before: this.is(),
            states: null,
            self: null,
            enters: null,
            exits: null,
            accepted: true
        }
        
        transitions.self = [states, params];

        var states_to_set = (() => {
            switch (type) {
                case STATE_CHANGE.DROP:
                    return this.states_active.filter((state) => !~states.indexOf(state));
                case STATE_CHANGE.ADD:
                    return states.concat(this.states_active);
                case STATE_CHANGE.SET:
                    return states;
            }
        })()
        transitions.states = 
            states_to_set = this.setupTargetStates_(states_to_set);
        
        if (type !== STATE_CHANGE.DROP && !is_autostate) {
            var states_accepted = states.every((state) => Boolean(~states_to_set.indexOf(state)));
            if (!states_accepted) {
                this.log("Cancelled the transition, as not all target states were accepted", 3);
                transitions.accepted = false;
            }
        }

        Object.assign(transitions, this.transition_(states_to_set, states, params))
        
        return transitions;
    }

    /*
     * Puts a transition in the queue, handles a log msg and unifies the states
     * array.
     */
    private enqueue_(type: number, states: string[] | string, params?: any[], target?: AsyncMachine) {
        var type_label = STATE_CHANGE_LABELS[type].toLowerCase();
        let states_parsed = this.parseStates(states);

        if (this.duringTransition()) {
            if (target) {
                this.log("Queued " + type_label + " state(s) " + (states_parsed.join(", ")) + " for an external machine", 2);
            } else {
                this.log("Queued " + type_label + " state(s) " + (states_parsed.join(", ")), 2);
            }
        }

        return this.queue.push([type, states_parsed, params, false, target]);
    }

    private processQueue_() {
        if (this.lock_queue) {
            return;
        }

        let ret: boolean[] = [];
        this.lock_queue = true;
        let row: IQueueRow;
        while (row = this.queue.shift()) {
            let target: AsyncMachine = row[QUEUE.TARGET] || this;
            let queue = target.queue;
            let transitions = target.prepareTransitions(row[QUEUE.STATE_CHANGE], this.parseStates(row[QUEUE.STATES]),
                    row[QUEUE.PARAMS], row[QUEUE.AUTO])
            let aborted = !transitions.accepted

            target.transition_events = []
            target.lock = true
            target.queue = [];
            
            try {
                // self transitions
                if (!aborted)
                    aborted = (false === target.selfTransitionExec_(transitions.self[0], transitions.self[1]));
                // exit transitions
                if (!aborted) {
                    for (let transition of transitions.exits) {
                        if (false === target.transitionExit_(transition[0], transition[1], transition[2], transition[3])) {
                            aborted = true;
                            continue;
                        }
                    }
                }
                // enter transitions
                if (!aborted) {
                    for (let transition of transitions.enters) {
                        if (false === target.transitionEnter_(transition[0], transition[1], transition[2])) {
                            aborted = true;
                            continue;
                        }
                    }
                }
                // state and end transitions (non-abortable)
                if (!aborted) {
                    target.setActiveStates_(transitions.states);
                    target.processPostTransition();
                    target.emit("change", transitions.before);
                }
                target.queue = aborted ? queue : queue.concat(target.queue)
            } catch (err) {
                let queued_exception: IQueueRow = [STATE_CHANGE.ADD, ["Exception"], [err, transitions.states]]
                target.queue = [queued_exception].concat(queue);
            }
            
            target.lock = false;
            
            if (aborted) {
                target.emit("cancelled");
            } else if ((target.hasStateChanged(transitions.before)) && !row[QUEUE.AUTO]) {
                var auto_states = target.prepareAutoStates();
                if (auto_states) {
                    target.queue.unshift(auto_states);
                }
            }

            if (row[QUEUE.STATE_CHANGE] === STATE_CHANGE.DROP) {
                ret.push(target.allStatesNotSet(transitions.states))
            } else {
                ret.push(target.every(...transitions.states))
            }
        }
        this.lock_queue = false
        return ret[0] || false;
    }

    private allStatesNotSet(states): boolean {
        return states.every((state) => !this.is(state));
    }

    private createDeferred(fn: Function, target, states, state_params: any[]): Deferred {
        var transition_states = this.is();

        var params = [target];
        if (states) {
            params.push(states);
        }
        if (state_params.length) {
            params.push.apply(params, state_params);
        }

        var deferred = new Deferred;
        deferred.promise.then((callback_params) => fn.apply(null, params.concat(callback_params)))["catch"]((err) => {
            var async_states = [].concat(params[0] instanceof AsyncMachine ? params[1] : params[0]);
            return this.add("Exception", err, transition_states, async_states);
        });

        this.last_promise = deferred.promise;

        return deferred;
    }

    private createCallback(deferred: Deferred): (err?, ...params) => void {
        return (err : any = null, ...params) => {
            if (err) {
                return deferred.reject(err);
            } else {
                return deferred.resolve(params);
            }
        };
    }

    private createListener(deferred: Deferred): (...params) => void {
        return (...params) => deferred.resolve(params);
    }

    private selfTransitionExec_(states: string[], params?: any[]) {
        if (params == null) {
            params = [];
        }
        var transition_params = <any[]>[states].concat(params);
        var ret = states.some((state) => {
            ret = void 0;
            var name = state + "_" + state;
            if (~this.states_active.indexOf(state)) {
                var context = this.getMethodContext(name);
                if (context) {
                    this.log("[transition] " + name, 2);
                    ret = context[name](...transition_params);
                    this.catchPromise(ret, states);
                } else {
                    this.log("[transition] " + name, 3);
                }

                if (ret === false) {
                    this.log("Self transition for " + state + " cancelled", 2);
                    return true;
                }

                var ret = this.emit.apply(this, [name].concat(transition_params));
                if (ret !== false) {
                    this.transition_events.push([name, transition_params]);
                }

                return ret === false;
            }
        });

        return !ret;
    }

    private setupTargetStates_(states: string[], exclude?: string[]) {
        states = this.parseStates(states);

        if (exclude == null) {
            exclude = [];
        }

        states = this.parseImplies_(states);
        states = this.removeDuplicateStates_(states);
        var already_blocked = [];
        states = this.parseRequires_(states);
        states = states.reverse().filter((name) => {
            var blocked_by = this.isStateBlocked_(states, name);
            blocked_by = blocked_by.filter((blocker_name) => !~already_blocked.indexOf(blocker_name));

            if (blocked_by.length) {
                already_blocked.push(name);
                if (this.is(name)) {
                    this.log("State " + name + " dropped by " + (blocked_by.join(", ")), 2);
                } else {
                    this.log("State " + name + " ignored because of " + (blocked_by.join(", ")), 3);
                }
            }
            return !blocked_by.length && !~exclude.indexOf(name);
        });
        return this.parseRequires_(states.reverse());
    }

    private parseImplies_(states: string[]): string[] {
        states.forEach((name) => {
            var state = this.get(name);
            if (!state.implies) {
                return;
            }
            return states = states.concat(state.implies);
        });

        return states;
    }

    private parseRequires_(states: string[]): string[] {
        var length_before = 0;
        var not_found_by_states = {};
        while (length_before !== states.length) {
            length_before = states.length;
            states = states.filter((name) => {
                var state = this.get(name);
                var not_found = [];
                !(state.requires != null ? state.requires.forEach((req) => {
                    var found = ~states.indexOf(req);
                    if (!found) {
                        return not_found.push(req);
                    }
                }) : void 0);

                if (not_found.length) {
                    not_found_by_states[name] = not_found;
                }

                return !not_found.length;
            });
        }

        if (Object.keys(not_found_by_states).length) {
            var state = "";
            var not_found = [];
            var names = (() => {
                var _results;
                _results = [];
                for (state in not_found_by_states) {
                    not_found = not_found_by_states[state];
                    _results.push(state + "(-" + (not_found.join(" -")) + ")");
                }
                return _results;
            })();
            this.log("Can't set the following states " + (names.join(", ")), 2);
        }

        return states;
    }

    private removeDuplicateStates_(states: string[]): string[] {
        var states2 = [];
        states.forEach((name) => {
            if (!~states2.indexOf(name)) {
                return states2.push(name);
            }
        });

        return states2;
    }

    private isStateBlocked_(states: string[], name: string): string[] {
        var blocked_by = [];
        states.forEach((name2) => {
            var state = this.get(name2);
            if (state.blocks && ~state.blocks.indexOf(name)) {
                return blocked_by.push(name2);
            }
        });

        return blocked_by;
    }

    private transition_(to: string[], explicit_states: string[], params: any[] = []): {
        exits: any[],
        enters: any[]
    } {
        var from = this.states_active.filter((state) => !~to.indexOf(state));

        this.orderStates_(to);
        this.orderStates_(from);

        // queue the transitions
        var queue = {
            exits: [],
            enters: []
        }
        for (let state of from)
            queue.exits.push([state, to, explicit_states, params])
        // var ret = from.some((state) => false === this.transitionExit_(state, to, explicit_states, params))

        for (let state of to) {
            // dont enter to already set states, except when it's a MULTI state
            if (this.is(state) && !this.get(state).multi)
                continue
            
            let transition_params = ~explicit_states.indexOf(state) ?
                params : [];
            // ret = this.transitionEnter_(state, to, transition_params);
            queue.enters.push([state, to, transition_params])
        }
        
        return queue
    }

    private setActiveStates_(target: string[]) {
        var previous = this.states_active;
        var new_states = this.diffStates(target, this.states_active);
        var removed_states = this.diffStates(this.states_active, target);
        var nochange_states = this.diffStates(target, new_states);
        this.states_active = target;
        target.forEach((state) => {
            if (!~previous.indexOf(state)) {
                return this.clock_[state]++;
            }
        });
        var log_msg = [];
        if (new_states.length) {
            log_msg.push("+" + (new_states.join(" +")));
        }
        if (removed_states.length) {
            log_msg.push("-" + (removed_states.join(" -")));
        }
        if (nochange_states.length && this.debug_level > 2) {
            if (new_states.length || removed_states.length) {
                log_msg.push("\n    ");
            }
            log_msg.push(nochange_states.join(", "));
        }
        if (log_msg.length) {
            this.log("[states] " + (log_msg.join(" ")), 1);
        }
    }

    processPostTransition() {
        for (let transition of this.transition_events) {
            let name = transition[0];
            let params = transition[1];
            let state, method;

            if (name.slice(-5) === "_exit") {
                state = name.slice(0, -5);
                method = state + "_end";
            } else if (name.slice(-6) === "_enter") {
                state = name.slice(0, -6);
                method = state + "_state";
            }

            var context = this.getMethodContext(method);
            if (context) {
                let ret
                this.log("[transition] " + method, 2);
                try {
                    ret = context[method](...params);
                } catch (err) {
                    this.drop(state);
                    throw err;
                }
                this.catchPromise(ret, this.is());
            } else {
                this.log("[transition] " + method, 3);
            }

            this.emit.apply(this, [method].concat(params));
        }

        this.transition_events = [];
    }

    getMethodContext(name) {
        if (this.target[name]) {
            return this.target;
        } else if (this[name]) {
            return this;
        }
    }

    private transitionExit_(from: string, to: string[], 
		explicit_states: string[], params: any[]) {
        if (~explicit_states.indexOf(from)) {
            var transition_params = params;
        }
        if (transition_params == null) {
            transition_params = [];
        }
        var ret = this.transitionExec_(from + "_exit", to, transition_params);
        if (ret === false) {
            return false;
        }
        ret = to.some((state) => {
            var transition = from + "_" + state;
            if (~explicit_states.indexOf(state)) {
                transition_params = params;
            }
            if (transition_params == null) {
                transition_params = [];
            }
            ret = this.transitionExec_(transition, to, transition_params);
            return ret === false;
        });

        if (ret === true) {
            return false;
        }
        ret = (this.transitionExec_(from + "_any", to)) === false;

        return !ret;
    }

    private transitionEnter_(to: string, target_states: string[], params: any[]) {
        var ret = this.transitionExec_("any_" + to, target_states, params);
        if (ret === false) {
            return false;
        }

        return this.transitionExec_(to + "_enter", target_states, params);
    }

    private transitionExec_(method: string, target_states: string[], params?: string[]) {
        var _ref;
        if (params == null) {
            params = [];
        }
        var transition_params = [];
        transition_params = [target_states].concat(params);
        var ret = void 0;

        var context = this.getMethodContext(method);
        if (context) {
            this.log("[transition] " + method, 2);
            ret = (_ref = context[method]) != null ? typeof _ref.apply === "function" ? _ref.apply(context, transition_params) : void 0 : void 0;
            this.catchPromise(ret, target_states);
        } else {
            this.log("[transition] " + method, 3);
        }

        if (ret !== false) {
            var is_exit = method.slice(-5) === "_exit";
            var is_enter = !is_exit && method.slice(-6) === "_enter";
            if (is_exit || is_enter) {
                this.transition_events.push([method, transition_params]);
            }
            ret = this.emit.apply(this, [method].concat(transition_params));
            if (ret === false) {
                this.log(("Cancelled transition to " + (target_states.join(", ")) + " by ") + ("the event " + method), 2);
            }
        } else {
            this.log(("Cancelled transition to " + (target_states.join(", ")) + " by ") + ("the method " + method), 2);
        }

        return ret;
    }

    private orderStates_(states: string[]): void {
        states.sort((e1, e2) => {
            var state1 = this.get(e1);
            var state2 = this.get(e2);
            var ret = 0;
            if (state1.depends && ~state1.depends.indexOf(e2)) {
                ret = 1;
            } else {
                if (state2.depends && ~state2.depends.indexOf(e1)) {
                    ret = -1;
                }
            }
            return ret;
        });
        return null;
    }

    private bindToStates(states: string[], listener: Function, abort?: Function, once?: boolean) {
        var fired = 0;
        var enter = () => {
            fired += 1;
            if (!(typeof abort === "function" ? abort() : void 0) && fired === states.length) {
                listener();
            }
            if (once || (typeof abort === "function" ? abort() : void 0)) {
                return states.map((state) => {
                    this.removeListener(state + "_state", enter);
                    return this.removeListener(state + "_end", exit);
                });
            }
        };
        function exit() {
            return fired -= 1;
        }
        return states.map((state) => {
            this.log("Binding to event " + state, 3);
            this.on(state + "_state", enter);
            return this.on(state + "_end", exit);
        });
    }

    private getAbortFunction(state: string, tick: number, abort?: () => boolean): () => boolean {
        return () => {
            if (typeof abort === "function" ? abort() : void 0) {
                return true;
            } else if (!this.is(state)) {
                this.log(("Aborted " + state + " listener as the state is not set. ") + ("Current states:\n    (" + (this.is().join(", ")) + ")"), 1);
                return true;
            } else if (!this.is(state, tick)) {
                this.log(("Aborted " + state + " listener as the tick changed. Current states:") + ("\n    (" + (this.is().join(", ")) + ")"), 1);
                return true;
            }

            return false;
        };
    }
}

export interface IState {
	depends?: string[];
	implies?: string[];
	blocks?: string[];
	requires?: string[];
	auto?: boolean;
	multi?: boolean;
}

export interface ITransitionHandler {
	(states: string[], ...params: any[]): boolean;
}

interface IPreparedTransitions {
    states: string[];
    before: string[];
    self: any[];
    enters: any[];
    exits: any[];
    accepted: boolean;
}

export default AsyncMachine;
