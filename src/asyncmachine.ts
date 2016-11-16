/**
 * TODO
 * - go through all the TODOs in the file
 * - cleanup post-coffeescript code
 */


import Transition from "./transition";
import EventEmitter from "./ee"
import uuid from './uuid-v4'
import {
	StateChangeTypes,
	Deferred,
	PipeFlags,
	IQueueRow,
	IPipedStateTarget,
	IState,
	TPipeBindings,
	TStateMethod,
	TLogHandler,
	NonExistingStateError,
	StateRelations,
	QueueRowFields,
	TAbortFunction,
	TransitionStepTypes,
} from './types'
import {
	IBind,
	IEmit,
} from './events'
// shims for current engines
import 'core-js/fn/array/keys'
import 'core-js/fn/array/includes'
import 'core-js/fn/object/entries'


export {
	PipeFlags,
	StateStructFields,
	TransitionStepTypes,
	TransitionStepFields,
	StateRelations,
	// IState,
} from './types'
export { default as Transition } from './transition'


/**
 * Creates an AsyncMachine instance (not a constructor) with specified states.
 * States properties are empty, so you'd need to set it by yourself.
 *
 * @param states List of state names to register on the new instance or a map
 *   of state names and their properties.
 * @return
 *
 * Using names:
 * ```
 * let states = asyncmachine.factory(['A', 'B','C'])
 * states.A = { add: ['B'] }
 * states.add('A')
 * states.is() // -> ['A', 'B']
 * ```
 *
 * Using a map:
 * ```
 * let states = asyncmachine.factory({
 *   A: { add: ['B'] },
 *   B: {},
 *   C: {}
 * })
 * states.add('A')
 * states.is() // -> ['A', 'B']
 * ```
 */
export function factory<T extends AsyncMachine<any, any>>(
		states: string[] | { [state: string]: IState } = [],
		constructor?: { new(...params: any[]): AsyncMachine<any, any>; }): T {
	var instance = <T><any>(new (constructor || AsyncMachine))

	if (states instanceof Array) {
		for (let state of states) {
			instance[state] = {};
			instance.register(state);
		}
	} else {
		for (let state of Object.keys(states)) {
			instance[state] = states[state];
			instance.register(state);
		}
	}

	return instance;
}

/**
 * Base class which you extend with your own one defining the states.
 * The [[Exception]] state is already provided.
 *
 * ```
 * class FooStates extends AsyncMachine {
 *   Enabled: {}
 *
 *   Downloading: drop: 'Downloaded'
 *   Downloaded = {
 *     drop: 'Downloading'
 * }
 *
 * class Foo
 *   constructor: ->
 *   	this.states = new FooStates this, yes
 *
 *   Downloading_state: (states, @url)
 *   	fetch url, this.states.addByCallack('Downloaded')
 *
 *   Downloaded_state: (states, local_path) ->
 *   	console.log 'Downloaded #{this.url} to #{local_path}'
 *
 * ```
 * TODO
 * - loose bind in favor of closures
 * - piping to an un existing state breaks the event loop
 */
export class AsyncMachine<TBind, TEmit> extends EventEmitter {

	/**
	 * Empty Exception state properties. See [[Exception_state]] transition handler.
	 */
	Exception = {
		multi: true
	};
	states_all: string[] = [];
	last_promise: Promise<any>;
	piped: { [state: string]: IPipedStateTarget[] } = {};
	/**
	 * If true, an exception will be printed immediately after it's thrown.
	 * Automatically turned on with logLevel > 0.
	 */
	print_exception = false;

	states_active: string[] = [];
	queue_: IQueueRow[] = [];
	lock: boolean = false;
	clock_: { [state: string]: number } = {};
	target: {};
	// TODO merge with [[lock]]
	lock_queue = false;
	log_level_: number = 0;
	log_handler_: TLogHandler;
	transition: Transition | null;
	protected internal_fields: string[] = ["states_all", "lock_queue",
		"states_active", "queue_", "lock", "last_promise",
		"log_level_", "log_handler_", "clock_", "target", "internal_fields",
		"piped", 'id_', 'print_exception', 'transition'];
	private id_: string = uuid();

	/**
	 * Creates a new instance with only state one registered, which is the
	 * Exception.
	 * When extending the class, you should register your states by using either
	 * [[registerAll]] or [[register]].
	 *
	 * @param target Target object for the transitions, useful when composing the
	 * 	states instance.
	 * @param register_all Automatically registers all defined states.
	 * @see [[AsyncMachine]] for the usage example.
	 */
	constructor(target?: {}, register_all: boolean = true) {
		super();

		this.setTarget(target || this);
		if (register_all)
			this.registerAll()
		else
			this.register("Exception")
	}

	/**
	 * All exceptions are caught into this state, including both synchronous and
	 * asynchronous from promises and callbacks. You can overcreateride it and
	 * handle exceptions based on their type and target states of the transition
	 * during which they appeared.
	 *
	 * @param err The exception object.
	 * @param target_states Target states of the transition during
	 * 	which the exception was thrown.
	 * @param base_states Base states in which the transition orginated.
	 * @param exception_transition The explicit state which thrown the exception.
	 * @param async_target_states Only for async transitions like
	 * [[addByCallback]], these are states which we're supposed to be set by the
	 * callback.
	 *
	 * Example of exception handling
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.Exception_state = (err, target_states) ->
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
	 * 		this.add 'Exception', error, states
	 * ```
	 *
	 * TODO update the docs
	 */
	Exception_state(err: Error, target_states: string[], base_states: string[],
			exception_transition: string, async_target_states?: string[]): void {
		if (this.print_exception)
			console.error("EXCEPTION from AsyncMachine")
		if (target_states && target_states.length > 0) {
			this.log(`Exception \"${err}\" when setting states:\n` +
				`${target_states.join(", ")}`);
		}
		if (Array.isArray(base_states)) {
			this.log(`Source states of the transition were:\n` +
				`${target_states.join(", ") || '-----'}`);
		}
		if (async_target_states && async_target_states.length > 0) {
			this.log(`Next states that were supposed to be (add|drop|set):\n` +
				`${async_target_states.join(", ")}`);
		}
		if (exception_transition) {
			this.log(`The call which caused the exception was ` +
				exception_transition);
		}
		// if the exception param was passed, print and throw (but outside of the
		// current stack trace)
		if (err) {
			if (this.print_exception)
				console.error(err)
			this.setImmediate(() => { throw err })
		}
	}

	/**
	 * Sets the target for the transition handlers. Useful to keep all you methods in
	 * in one class while the states class is composed as an attribute of the main
	 * object. There's also a shorthand for this method as
	 * [[AsyncMachine.constructor]]'s param.
	 *
	 * @param target Target object.
	 *
	 * ```
	 * class Foo
	 * 	constructor: ->
	 * 		this.states = asyncmachine.factory(['A', 'B', 'C'])
	 * 		this.states.setTarget this
	 * 		this.states.add 'A'
	 *
	 * 	A_state: ->
	 * 		console.log 'State A set'
	 * ```
	 */
	setTarget(target: {}) {
		return this.target = target;
	}

	/**
	 * Registers all defined states. Use it only if you don't define any other
	 * attributes on the object (or it's prototype). If you do, register the states
	 * manually with the [[register]] method. There's also a shorthand for this
	 * method as [[AsyncMachine.constructor]]'s param.
	 *
	 * ```
	 * class States extends AsyncMachine {
	 *   constructor() {
	 *     this.A = {}
	 *     this.B = {}
	 *
	 *     this.registerAll()
	 *     console.log(this.states_all) // -> ['Exception', 'A', 'B']
	 *   }
	 * }
	 * ```
	 */
	registerAll() {
		// test the instance vars
		for (let name in this) {
			let value = this[name]
			if ((this.hasOwnProperty(name)) && !this.internal_fields.includes(name)
					&& !(value instanceof Function)) {
				this.register(name)
			}
		}

		// test the prototype chain
		var constructor = this.constructor.prototype
		if (constructor === AsyncMachine.prototype)
			return

		while (true) {
			for (let name in constructor) {
				let value = constructor[name];
				if ((constructor.hasOwnProperty(name))
						&& !this.internal_fields.includes(name)
						&& !(value instanceof Function)) {
					this.register(name)
				}
			}

			constructor = Object.getPrototypeOf(constructor)
			if (constructor === AsyncMachine.prototype)
				break
		}
	}

	/**
	 * Returns an array of relations from one state to another.
	 * Maximum set is ["drop", "after", "add", "require"].
	 *
	 * TODO code sample
	 */
	getRelationsOf(from_state: string, to_state?: string): StateRelations[] {
		this.parseStates(from_state)
		if (to_state)
			this.parseStates(to_state)
		let state = this.get(from_state)
		let relations = [StateRelations.AFTER, StateRelations.ADD,
			StateRelations.DROP, StateRelations.REQUIRE]

		return relations.filter( relation => {
			if (!state[relation])
				return false
			if (to_state && !state[relation].includes(to_state))
				return false
			return true
		})
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
	 *
	 * ```
	 * states = asyncmachine.factory ['A', 'B']
	 * states.add 'A'
	 * states.is 'A' // -> true
	 * states.is ['A'] // -> true
	 * states.is ['A', 'B'] // -> false
	 * // assert the tick
	 * tick = states.clock 'A'
	 * states.drop('A')
	 * states.add 'A'
	 * states.is 'A', tick // -> false
	 * ```
	 */
	is(states: string | string[], tick?: number): boolean;
	is(): string[];
	is(states?: any, tick?: any): any {
		if (!states) {
			return this.states_active;
		}
		let states_parsed = this.parseStates(states)
		var active = states_parsed.every( (state) => {
			return Boolean(~this.states_active.indexOf(state));
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add ['A', 'B']
	 *
	 * states.any 'A', 'C' // -> true
	 * states.any ['A', 'C'], 'C' // -> false
	 * ```
	 */
	any(...states: string[]): boolean;
	any(...states: string[][]): boolean;
	any(...states: any[]): boolean {
		return states.some((name) => {
			if (Array.isArray(name))
				return this.every(...name)
			else
				return this.is(name)
		});
	}

	/**
	 * Checks if all the passed states are set.
	 *
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add ['A', 'B']
	 *
	 * states.every 'A', 'B' // -> true
	 * states.every 'A', 'B', 'C' // -> false
	 * ```
	 */
	every(...states: string[]): boolean {
		return states.every((name) => Boolean(~this.states_active.indexOf(name)));
	}

	/**
	 * Returns the current queue. For struct's meaning, see [[QUEUE]].
	 */
	queue(): IQueueRow[] {
		return this.queue_;
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
	 * states.Disposed = drop: 'Enabled'
	 *
	 * states.register 'Enabled', 'Disposed'
	 *
	 * states.add 'Enabled'
	 * states.is() // -> 'Enabled'
	 * ```
	 */
	register(...states: string[]) {
		// TODO dont register during a transition
		for (let state of this.parseStates(states)) {
			if (!this.states_all.includes(state))
				this.states_all.push(state)
			this.clock_[state] = 0
		}
	}

	/**
	 * TODO desc
	 * TODO sample
	 * TODO test
	 * @param name
	 */
	deregister(name: string) {
		// TODO dont deregister during a transition
		// TODO
	}

	/**
	 * Returns state's properties.
	 *
	 * @param state State name.
	 * @return
	 *
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.A = drop: ['B']
	 *
	 * states.get('A') // -> { drop: ['B'] }
	 * ```
	 */
	get(state: string): IState {
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.set('A')
	 * states.is() // -> ['A']
	 * states.set('B')
	 * states.is() // -> ['B']
	 * ```
	 *
	 * State negotiation
	 * ```
	 * states = asyncmachine.factory ['A', 'B']
	 * # Transition enter negotiation
	 * states.A_enter = -> no
	 * states.add 'A' // -> false
	 * ```
	 *
	 * Setting a state on an external machine
	 * ```
	 * states1 = asyncmachine.factory ['A', 'B']
	 * states2 = asyncmachine.factory ['C', 'D']
	 *
	 * states1.A_enter ->
	 * 	# this transition will be queued and executed after the current transition
	 * 	# is fully finished
	 * 	states1.add states2, 'B'
	 * ```
	 */
	set(target: AsyncMachine<TBind, TEmit>, states: string[] | string, ...params: any[]): boolean;
	set(target: string[] | string, states?: any, ...params: any[]): boolean;
	set(target: any, states?: any, ...params: any[]): boolean {
		if (!(target instanceof AsyncMachine)) {
			if (states) {
				params = [states].concat(params);
			}
			states = target
			target = this
		}

		this.enqueue_(StateChangeTypes.SET, states, params, target);

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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * setTimeout states.setByCallback('B')
	 * ```
	 *
	 */
	setByCallback(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (err?: any, ...params: any[]) => void {
		// TODO closure instead of bind
		return this.createCallback(this.createDeferred(this.set.bind(this), target,
			states, params));
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * emitter = new EventEmitter
	 * emitter.on 'ready', states.setByListener('A')
	 * emitter.on 'error', states.addByListener('Exception')
	 * ```
	 */
	setByListener(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure instead of bind
		return this.createListener(this.createDeferred(this.set.bind(this), target,
			states, params));
	}

	/**
	 * Deferred version of [[set]], setting the requested states on the next event
	 * loop's tick. Useful if you want to start with a fresh stack trace.
	 *
	 * See [[set]] for the params description.
	 *
	 * Example
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.set('A')
	 * states.setNext('B')
	 * states.is() // -> ['A']
	 * ```
	 */
	setNext(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure
		let fn = this.set.bind(this);
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add 'A'
	 * states.is() // -> ['A']
	 * states.add('B')
	 * states.is() // -> ['B']
	 * ```
	 *
	 * State negotiation
	 * ```
	 * states = asyncmachine.factory ['A', 'B']
	 * # Transition enter negotiation
	 * states.A_enter = -> no
	 * states.add('A' )// -> false
	 * ```
	 *
	 * Adding a state on an external machine
	 * ```
	 * states1 = asyncmachine.factory ['A', 'B']
	 * states2 = asyncmachine.factory ['C', 'D']
	 *
	 * states1.A_enter ->
	 * 	# this transition will be queued and executed after the current transition
	 * 	# fully finishes
	 * 	states1.add states2, 'B'
	 * ```
	 */
	add(target: AsyncMachine<TBind, TEmit>, states: string[] | string, ...params: any[]): boolean;
	add(target: string[] | string, states?: any, ...params: any[]): boolean;
	add(target: any, states?: any, ...params: any[]): boolean {
		if (!(target instanceof AsyncMachine)) {
			if (states) {
				params = [states].concat(params);
			}
			states = target;
			target = this
		}

		this.enqueue_(StateChangeTypes.ADD, states, params, target);

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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * someNodeCallback 'foo.com', states.addByCallback('B')
	 * ```
	 *
	 */
	addByCallback(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (err?: any, ...params: any[]) => void {
		// TODO closure instead of bind
		return this.createCallback(this.createDeferred(this.add.bind(this), target,
			states, params));
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * emitter = new EventEmitter
	 * emitter.on 'ready', states.addByListener('A')
	 * emitter.on 'error', states.addByListener('Exception')
	 * ```
	 */
	addByListener(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure instead of bind
		return this.createListener(this.createDeferred(this.add.bind(this), target,
			states, params));
	}

	/**
	 * Deferred version of [[add]], adding the requested states on the next event
	 * loop's tick. Useful if you want to start with a fresh stack trace.
	 *
	 * See [[add]] for the params description.
	 *
	 * Example
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add('A')
	 * states.addNext('B')
	 * states.is() // -> ['A', 'B']
	 * ```
	 */
	addNext(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure
		let fn = this.add.bind(this);
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.drop('A')
	 * states.is() // -> ['A']
	 * states.drop('B')
	 * states.is() // -> ['B']
	 * ```
	 *
	 * State negotiation
	 * ```
	 * states = asyncmachine.factory ['A', 'B']
	 * # Transition enter negotiation
	 * states.A_enter = -> no
	 * states.add('A' )// -> false
	 * ```
	 *
	 * Dropping a state on an external machine
	 * ```
	 * states1 = asyncmachine.factory ['A', 'B']
	 * states2 = asyncmachine.factory ['C', 'D']
	 *
	 * states1.A_enter ->
	 * 	# this transition will be queued and executed after the current transition
	 * 	# fully finishes
	 * 	states1.add states2, 'B'
	 * ```
	 */
	drop(target: AsyncMachine<TBind, TEmit>, states: string[] | string, ...params: any[]): boolean;
	drop(target: string[] | string, states?: any, ...params: any[]): boolean;
	drop(target: any, states?: any, ...params: any[]): boolean {
		if (!(target instanceof AsyncMachine)) {
			if (states) {
				params = [states].concat(params)
			}
			states = target
			target = this
		}

		this.enqueue_(StateChangeTypes.DROP, states, params, target)

		return this.processQueue_()
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * someNodeCallback 'foo.com', states.dropByCallback('B')
	 * ```
	 *
	 */
	dropByCallback(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (err?: any, ...params: any[]) => void {
		// TODO closure instead of bind
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * emitter = new EventEmitter
	 * emitter.on 'ready', states.dropByListener('A')
	 * emitter.on 'error', states.setByListener('Exception')
	 * ```
	 */
	dropByListener(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure instead of bind
		return this.createListener(this.createDeferred(this.drop.bind(this),
			target, states, params));
	}

	/**
	 * Deferred version of [[drop]], dropping the requested states on the next
	 * event loop's tick. Useful if you want to start with a fresh stack trace.
	 *
	 * See [[drop]] for the params description.
	 *
	 * Example
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add('A')
	 * states.dropNext('A')
	 * states.is('A') // -> true
	 * ```
	 */
	dropNext(target: AsyncMachine<TBind, TEmit> | string[] | string,
			states?: string[] | string | any, ...params: any[])
			: (...params: any[]) => void {
		// TODO closure
		let fn = this.drop.bind(this);
		return this.setImmediate(fn, target, states, params);
	}

	/**
	 * Pipes (forwards) a state to another state machine.
	 *
	 * @param state Name of the state to pipe.
	 * @param machine Target machine to which the state should be forwarded.
	 * @param target_state If the target state name should be different, this is
	 *   the name. Applicable if only one state is piped.
	 * @param flags Different modes of piping. See [[PipeFlags]].
	 *
	 * Piping without negotiation
	 * ```
	 * states1 = asyncmachine.factory(['A', 'B', 'C'])
	 * states2 = asyncmachine.factory(['A', 'B', 'C'])
	 * states1.pipe('A', states2)
	 * states1.add('A')
	 * states2.is('A') // -> true
	 * ```
	 *
	 * Piping with negotiation
	 * ```
	 * states1 = asyncmachine.factory(['A', 'B', 'C'])
	 * states2 = asyncmachine.factory(['A', 'B', 'C'])
	 * states2.A_enter = -> no
	 * states1.pipe('A', states2, null, asyncmachine.PipeFlags.NEGOTIATION)
	 * states1.add('A')
	 * states2.is('A') // -> false
	 * ```
	 */
	pipe(state: string | string[], machine: AsyncMachine<TBind, TEmit>, target_state?: string, flags?: PipeFlags) {
		this.pipeBind(state, machine, target_state, flags)
	}

	/**
	 * Pipes all the states from this machine to the passed one.
	 *
	 * The exception state is never piped.
	 *
	 * @param machine Target machine to which the state should be forwarded.
	 */
	pipeAll(machine: AsyncMachine<TBind, TEmit>, flags?: PipeFlags) {
		// Do not forward the Exception state
		let states_all = this.states_all.filter( state => state !== 'Exception' )

		this.pipeBind(states_all, machine, null, flags)
	}

	/**
	 * Removes an existing pipe. All params are optional.
	 *
	 * @param states Source states. Empty means any state.
	 * @param machine Target machine. Empty means any machine.
	 * @param flags Pipe flags. Empty means any flags.
	 *
	 * TODO optimise, if needed
	 */
	pipeRemove(states?: string | string[], machine?: AsyncMachine<TBind, TEmit>,
			flags?: PipeFlags) {
		let bindings = flags ? this.getPipeBindings(flags) : null
		let event_types = flags ? Object.keys(bindings) : null
		let parsed_states = states ? this.parseStates(states) : null
		let to_emit: this[] = []

		for (let state of Object.keys(this.piped)) {
			let pipes = this.piped[state]
			if (parsed_states && !parsed_states.includes(state))
				continue
			for (let i = 0; i < pipes.length; i++) {
				let pipe = pipes[i]
				if (machine && machine !== pipe.machine)
					continue
				if (event_types && !event_types.includes(pipe.event_type))
					continue
				this.removeListener(`${state}_${pipe.event_type}`, pipe.listener)
				pipes.splice(i, 1)
				// stay on the same index
				i--
				if (!to_emit.includes(pipe.machine))
					to_emit.push(pipe.machine)
				if (!to_emit.includes(this))
					to_emit.push(this)
			}
			if (!pipes.length)
				delete this.piped[state]
		}
		for (let machine of to_emit) {
			// TODO emit pipe-in-removed pipe-out-removed, passing the pipe binding
			machine.emit('pipe')
		}
	}

	/**
	 * TODO should remove binding returned by pipe() and pipeAll() methods.
	 */
	pipeRemoveBinding(/*binding*/) {
		throw new Error('TODO')
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.add('A')
	 * states.add('A')
	 * states.clock('A') // -> 1
	 * states.drop('A')
	 * states.add('A')
	 * states.clock('A') // -> 2
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
	 * states1 = asyncmachine.factory(['A', 'B', 'C'])
	 * states2 = states1.createChild()
	 *
	 * states2.add('A')
	 * states2.is() // -> ['A']
	 * states1.is() // -> []
	 * ````
	 *
	 * TODO this is for sure seriously broken
	 */
	createChild(): this {
		var child = Object.create(this)
		child.states_active = []
		child.clock_ = {}
		child.queue_ = []
		this.states_all.forEach( state => child.clock[state] = 0)
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 *
	 * states.A_enter = ->
	 *   this.duringTransition() // -> true
	 *
	 * states.A_state = ->
	 *   this.duringTransition() // -> true
	 *
	 * states.add('A')
	 * ````
	 */
	duringTransition(): boolean {
		return this.lock
	}

	/**
	 * Returns the list of states from which the current transition started.
	 *
	 * Requires [[duringTranstion]] to be true or it'll throw.
	 */
	from() {
		if (!this.transition)
			throw new Error(`AsyncMachine ${this.id()} not during transition`)

		return this.transition.before
	}

	/**
	 * Returns the list of states to which the current transition is heading.
	 *
	 * Requires [[duringTranstion]] to be true or it'll throw.
	 */
	to() {
		if (!this.transition)
			throw new Error(`AsyncMachine ${this.id()} not during transition`)

		return this.transition.states
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
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 *
	 * states.A_state = ->
	 *   abort = @getAbort 'A'
	 *   setTimeout (->
	 *       return if abort()
	 *       console.log 'never reached'
	 *     ), 0
	 *
	 * states.add('A')
	 * states.drop('A')
	 * ````
	 *
	 * TODO support multiple states
	 * TODO support default values for state names
	 *
	 * @param state Name of the state
	 * @param abort Existing abort function (optional)
	 * @return A new abort function
	 */
	getAbort(state: string, abort?: () => boolean): () => boolean {
		var tick = this.clock(state);

		return this.getAbortFunction(state, tick, abort);
	}

	/**
	 * Resolves the returned promise when all passed states are set (at the same
	 * time). Accepts an optional abort function.
	 *
	 * Example
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.when(['A', 'B']).then( () => {
	 *   console.log()'A, B')
	 * }
	 *
	 * states.add('A')
	 * states.add('B') // prints 'A, B'
	 * ```
	 *
	 * # TODO support push cancellation
	 *
	 * @param state List of state names
	 * @param abort Existing abort function (optional)
	 * @return Promise resolved once all states are set simultaneously.
	 */
	when(states: string | string[], abort?: TAbortFunction): Promise<null> {
		let states_parsed = this.parseStates(states)
		return new Promise<null>((resolve) => {
			this.bindToStates(states_parsed, resolve, abort)
		})
	}

	/**
	 * Enabled debug messages sent to the console (or the custom handler).
	 *
	 * There's 4 log levels:
	 * - 0: logging is off
	 * - 1: displays only the state changes in a diff format
	 * - 2: displays all operations which happened along with rejected state
	 *   changes
	 * - 3: displays more decision logic
	 * - 4: displays everything, including all possible operations
	 *
	 * Example
	 * ```
	 * states = asyncmachine.factory(['A', 'B', 'C'])
	 * states.logLevel(1)
	 * states.add('A')
	 * // -> [add] state Enabled
	 * // -> [states] +Enabled
	 * ````
	 *
	 * @param prefix Prefix before all console messages.
	 * @param level Error level (1-3).
	 */
	logLevel(log_level: number | string): this;
	logLevel(): number;
	logLevel(log_level?: number | string): this | number {
		if (log_level !== undefined) {
			this.print_exception = Boolean(log_level)
			this.log_level_ = parseInt(log_level as string, 10)
			return this
		} else
			return this.log_level_
	}

	logHandler(log_handler: TLogHandler): this;
	logHandler(): TLogHandler;
	logHandler(log_handler?: TLogHandler): this | Function {
		if (log_handler) {
			this.log_handler_ = log_handler
			return this
		} else
			return this.log_handler_
	}

	id(id: string): this;
	id(): string;
	id(id?: string): this | string {
		if (id !== undefined) {
			if (id != this.id_) {
				let old_id = this.id_
				this.id_ = id
				this.emit('id-changed', id, old_id)
			}
			return this
		} else
			return this.id_
	}

	/**
	 * TODO docs
	 * TODO rename TPipeBindings to TPipeBinding
	 * TODO copy these to once() and emit()
	 */
	on: TBind & IBind;
	on(event: string, listener: Function, context?: Object): this {
		// if event is a NAME_state event, fire immediately if the state is set
		if ((event.slice(-6) === "_state" || event.slice(-6) === "_enter")
				&& this.is(event.slice(0, -6))) {
			this.catchPromise(listener.call(context));
		// if event is a NAME_end event, fire immediately if the state isnt set
		} else if ((event.slice(-4) === "_end" && !this.is(event.slice(0, -4))) ||
				event.slice(-5) === "_exit" && !this.is(event.slice(0, -5)) ) {
			this.catchPromise(listener.call(context));
		}

		super.on(event, listener, context);
		return this;
	}

	/**
	 * TODO docs
	 * TODO types
	 */
	once: TBind & IBind;
	once(event: string, listener: Function, context?: Object): this {
		// is event is a NAME_state event, fire immediately if the state is set
		// and dont register the listener
		if ((event.slice(-6) === "_state" || event.slice(-6) === "_enter")
				&& this.is(event.slice(0, -6))) {
			this.catchPromise(listener.call(context));
		// is event is a NAME_end event, fire immediately if the state is not set
		// and dont register the listener
		} else if ((event.slice(-4) === "_end" && !this.is(event.slice(0, -4))) ||
				event.slice(-5) === "_exit" && !this.is(event.slice(0, -5)) ) {
			this.catchPromise(listener.call(context));
		} else {
			super.once(event, listener, context);
		}

		return this;
	}

	emit: TEmit & IEmit;

	// TODO type all the emit calls

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
	catchPromise<T>(promise: T, target_states?: string[]): T {
		if (isPromise(promise)) {
			promise.catch( (error: any) => {
				this.add("Exception", error, target_states)
			})
		}
		return promise
	}

	/**
	 * Diffs two state sets and returns the ones present only in the 1st one.
	 *
	 * @param states1 Source states list.
	 * @param states2 Set to diff against (picking up the non existing ones).
	 * @return List of states in states1 but not in states2.
	 */
	diffStates(states1: string[], states2: string[]) {
		return states1.filter( name => !states2.includes(name) )
	}

	logHandlerDefault(msg: string, level: number) {
		if (level > this.log_level_)
			return;

		let prefix = this.id() ? `[${this.id()}] ` : ''
		msg = prefix + msg

		console.log(msg)
	}

	log(msg: string, level: number = 1) {
		if (this.log_handler_)
			this.log_handler_(msg, level)
		else
			this.logHandlerDefault(msg, level)
	}

	// PRIVATES

	protected getPipeBindings(flags?: PipeFlags): TPipeBindings {
		if (flags & PipeFlags.INVERT && flags & PipeFlags.NEGOTIATION) {
			return {
				enter: "drop",
				exit: "add"
			}
		} else if (flags & PipeFlags.NEGOTIATION_BOTH) {
			return {
				enter: "add",
				exit: "drop",
				state: "add",
				end: "drop"
			}
		} else if (flags & PipeFlags.NEGOTIATION) {
			return {
				enter: "add",
				exit: "drop"
			}
		} else if (flags & PipeFlags.INVERT) {
			return {
				state: "drop",
				end: "add"
			}
		}
		return {
			state: "add",
			end: "drop"
		}
	}

	protected pipeBind(states: string | string[], machine: AsyncMachine<TBind, TEmit>,
			requested_state?: string | null, flags?: PipeFlags) {
		let bindings = this.getPipeBindings(flags)
		let parsed_states = this.parseStates(states)

		if (requested_state && typeof requested_state !== 'string')
			throw new Error('target_state has to be string or null')

		if ((flags & PipeFlags.NEGOTIATION || flags & PipeFlags.NEGOTIATION_BOTH)
				&& flags & PipeFlags.LOCAL_QUEUE)
			throw new Error('Cant pipe negotiation into the local queue')

		let tags = ''
		if (flags & PipeFlags.INVERT)
			tags += ':invert'
		if (flags & PipeFlags.NEGOTIATION)
			tags += ':neg'
		if (flags & PipeFlags.NEGOTIATION_BOTH)
			tags += ':neg_both'

		if (parsed_states.length == 1 && requested_state)
			this.log(`[pipe${tags}] ${parsed_states[0]} as ${requested_state} to ${machine.id()}`, 2)
		else
			this.log(`[pipe${tags}] ${parsed_states.join(', ')} to ${machine.id()}`, 2)

		let emit_on: AsyncMachine<IBind, IEmit>[] = []

		for (let state of parsed_states) {
			// accept a different name only when one state is piped
			let target_state = (parsed_states.length == 1 && requested_state) || state;

			for (let [event_type, method_name] of Object.entries(bindings)) {
				let listener = () => {
					let target = (flags & PipeFlags.LOCAL_QUEUE) ? this : machine
					if (this.transition) {
						this.transition.addStep([machine.id(), target_state], [this.id(), state],
							TransitionStepTypes.PIPE)
					}

					return target[method_name](machine, target_state)
				}
				// TODO extract
				// TODO check for duplicates
				if (!this.piped[state])
					this.piped[state] = []
				this.piped[state].push({
					state: target_state,
					machine: machine,
					event_type: event_type as TStateMethod,
					flags,
					listener
				})
				// assert target states
				machine.parseStates(target_state)
				// setup the forwarding listener
				// TODO listener-less piping
				// read from #pipes directly, inside the transition
				this.on(`${state}_${event_type}` as 'ts-dynamic', listener)
			}

			if (!emit_on.includes(this))
				emit_on.push(this)
			if (machine !== this && !emit_on.includes(machine))
				emit_on.push(machine)
		}

		for (let machine of emit_on) {
			// TODO emit pipe-in and pipe-out, on source and target respectively
			// passing the pipe binding
			machine.emit('pipe')
		}
	}

	/**
	 * Override for EventEmitter method calling a specific listener. Binds to
	 * a promis if returned by the listener.
	 *
	 * TODO incorporate into EE, saving one call stack frame
	 */
	protected callListener(listener: Function, context: Object, params: any[])
			: any {
		var ret = listener.apply(context, params);

		// assume params[0] are the target states of the transition
		return this.catchPromise(ret, params[0]);
	}

	// TODO make it cancellable
	setImmediate(fn: Function, ...params: any[]) {
		if (setImmediate) {
			return setImmediate.apply(null, [fn].concat(params));
		} else {
			return setTimeout(fn.apply(null, params), 0);
		}
	}

	hasStateChanged(states_before: string[]): boolean {
		var length_equals = this.is().length === states_before.length;

		return !length_equals || Boolean(this.diffStates(states_before, this.is()).length);
	}

	parseStates(states: string | string[]) {
		// TODO remove duplicates
		var states_parsed = (<string[]>[]).concat(states);

		return states_parsed.filter((state) => {
			if (typeof state !== "string" || !this.get(state)) {
				let id = this.id() ? ` for machine "${this.id()}"` : ""
				throw new NonExistingStateError(state + id);
			}

			return true;
		});
	}

	/**
	 * Returns the JSON structure of states along with their relations.
	 */
	states(): { [name: string]: IState } {
		let ret: { [name: string]: IState } = {}
		for (let state of this.states_all)
			ret[state] = this.get(state)
		return ret
	}

	/*
	 * Puts a transition in the queue, handles a log msg and unifies the states
	 * array.
	 */
	private enqueue_(type: number, states: string[] | string, params: any[] = [],
			target: AsyncMachine<TBind, TEmit> = this) {
		var type_label = StateChangeTypes[type].toLowerCase();
		let states_parsed = target.parseStates(states);

		let queue = this.queue_
		if (this.duringTransition()) {
			if (this.transition && this.transition.source_machine !== this) {
				// TODO log msg for using the parent queue
				queue = this.transition.source_machine.queue_
			}
			if (target !== this) {
				this.log(`[queue:${type_label}] [${target.id()}] ${states_parsed.join(", ")}`, 2);
			} else {
				this.log(`[queue:${type_label}] ${states_parsed.join(", ")}`, 2);
			}
		}

		return queue.push([type, states_parsed, params, false, target]);
	}

	// Goes through the whole queue collecting return values.
	private processQueue_(): boolean {
		if (this.lock_queue)
			return false
		if (this.lock) {
			// instance is during a transition from an external queue
			// wait for it to finish OR schedule this queue somehow
			return false
		}

		let ret: boolean[] = [];
		this.lock_queue = true;
		let row: IQueueRow | undefined;
		while (row = this.queue_.shift()) {
			if (!row[QueueRowFields.TARGET])
				row[QueueRowFields.TARGET] = this
			this.transition = new Transition(this, row)
			// expose the current transition also on the target machine
			row[QueueRowFields.TARGET].transition = this.transition
			ret.push(this.transition.exec())
			// GC the transition
			row[QueueRowFields.TARGET].transition = null
		}
		// GC the transition
		this.transition = null
		this.lock_queue = false
		return ret[0] || false;
	}

	allStatesNotSet(states: string[]): boolean {
		return states.every((state) => !this.is(state))
	}

	private createDeferred(fn: Function, target: AsyncMachine<TBind, TEmit> | string | string[],
			states: string | string[] | any, state_params: any[]): Deferred {
		// TODO use the current transition's states if available (for enter/exit
		// transitions)
		var transition_states = this.is();

		var params: any[] = [target];
		if (states) {
			params.push(states);
		}
		if (state_params.length) {
			params.push.apply(params, state_params);
		}

		var deferred = new Deferred

		deferred.promise
			.then( callback_params => {
				return fn.apply(null, params.concat(callback_params))
			}).catch( err => {
				var async_states = [].concat(params[0] instanceof AsyncMachine ? params[1] : params[0]);
				return this.add("Exception", err, transition_states, async_states);
			});

		this.last_promise = deferred.promise;

		return deferred;
	}

	private createCallback(deferred: Deferred): (err?: any, ...params: any[]) => void {
		return (err : any = null, ...params: any[]) => {
			if (err) {
				return deferred.reject(err);
			} else {
				return deferred.resolve(params);
			}
		};
	}

	private createListener(deferred: Deferred): (...params: any[]) => void {
		return (...params: any[]) => deferred.resolve(params);
	}

	/**
	 * Sets the new active states bumping the counters. Returns an array of
	 * previously active states.
	 */
	setActiveStates_(explicite_states: string[], target: string[]): string[] {
		var previous = this.states_active;
		var new_states = this.diffStates(target, this.states_active);
		var removed_states = this.diffStates(this.states_active, target);
		var nochange_states = this.diffStates(target, new_states);
		this.states_active = target;
		// Tick all the new states and the explicite multi states
		for (let state of target) {
			let data = this.get(state)
			if (!~previous.indexOf(state) ||
					(~explicite_states.indexOf(state) && data.multi)) {
				this.clock_[state]++;
			}
		}

		// construct a logging msg
		var log_msg: string[] = [];
		if (new_states.length)
			log_msg.push("+" + new_states.join(" +"))

		if (removed_states.length) {
			log_msg.push("-" + (removed_states.join(" -")));
		}
		// TODO fix
		if (nochange_states.length && this.log_level_ > 2) {
			if (new_states.length || removed_states.length) {
				log_msg.push("\n    ");
			}
			log_msg.push(nochange_states.join(", "));
		}
		if (log_msg.length) {
			this.log("[states] " + (log_msg.join(" ")), 1);
		}

		return previous
	}

	getMethodContext(name: string): Object | null {
		if (this.target[name] && this.target[name] instanceof Function) {
			return this.target;
		} else if (this[name] && this[name] instanceof Function) {
			return this;
		}
		return null
	}

	// TODO bind to _enter and _exit as well to support the negotiation phase in
	// piped events
	private bindToStates(states: string[], listener: Function,
			abort?: TAbortFunction) {
		var enter = () => {
			let should_abort = abort && abort()
			if (!should_abort && this.is(states))
				listener()

			if (this.is(states)) {
				this.log(`[bind:off] ${states.join(', ')}`, 3)
				for (let state of states)
					this.removeListener(`${state}_state`, enter)
			}
		}

		this.log(`[bind:on] ${states.join(', ')}`, 3)
		for (let state of states)
			this.on(`${state}_state` as 'ts-dynamic', enter)
	}

	// TODO compose the existing abort function without recursion
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


function isPromise(promise: any): promise is Promise<any> {
	return promise && promise.then && promise.catch
}


export default AsyncMachine;