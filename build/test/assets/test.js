// Generated by CoffeeScript 1.4.0
(function() {
  var expect, multistatemachine, sinon,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  multistatemachine = require('multistatemachine');

  expect = require('chai').expect;

  sinon = require('sinon');

  describe("multistatemachine", function() {
    var FooMachine, assert_order, mock_states;
    FooMachine = (function(_super) {

      __extends(FooMachine, _super);

      FooMachine.prototype.state_A = {};

      FooMachine.prototype.state_B = {};

      FooMachine.prototype.state_C = {};

      FooMachine.prototype.state_D = {};

      function FooMachine(state, config) {
        FooMachine.__super__.constructor.call(this, state, config);
      }

      return FooMachine;

    })(multistatemachine.MultiStateMachine);
    mock_states = function(instance, states) {
      var inner, state, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = states.length; _i < _len; _i++) {
        state = states[_i];
        instance["" + state + "_enter"] = sinon.spy();
        instance["" + state + "_exit"] = sinon.spy();
        instance["" + state + "_any"] = sinon.spy();
        instance["any_" + state] = sinon.spy();
        _results.push((function() {
          var _j, _len1, _results1;
          _results1 = [];
          for (_j = 0, _len1 = states.length; _j < _len1; _j++) {
            inner = states[_j];
            if (inner === state) {
              continue;
            }
            _results1.push(instance["" + inner + "_" + state] = sinon.spy());
          }
          return _results1;
        })());
      }
      return _results;
    };
    assert_order = function(order) {
      var check, k, m, _i, _j, _len, _len1, _ref, _ref1, _results;
      _ref = order.slice(0, -1);
      for (k = _i = 0, _len = _ref.length; _i < _len; k = ++_i) {
        m = _ref[k];
        order[k] = m.calledBefore(order[k + 1]);
      }
      _ref1 = order.slice(0, -1);
      _results = [];
      for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
        check = _ref1[_j];
        _results.push(expect(check).to.be.ok);
      }
      return _results;
    };
    beforeEach(function() {
      return this.machine = new FooMachine('A');
    });
    it("should allow for a delayed start");
    it("should accept the starting state", function() {
      return expect(this.machine.state()).to.eql(["A"]);
    });
    it("should allow to set the state", function() {
      this.machine.setState("B");
      return expect(this.machine.state()).to.eql(["B"]);
    });
    it("should allow to add a state", function() {
      this.machine.addState("B");
      return expect(this.machine.state()).to.eql(["A", "B"]);
    });
    it("should allow to drop a state", function() {
      this.machine.setState(["B", "C"]);
      this.machine.dropState('C');
      return expect(this.machine.state()).to.eql(["B"]);
    });
    it('should allow to define a new state');
    it("should skip non existing states", function() {
      this.machine.A_exit = sinon.spy();
      this.machine.setState("unknown");
      return expect(this.machine.A_exit.calledOnce).not.to.be.ok;
    });
    describe("when single to single state transition", function() {
      beforeEach(function() {
        this.machine = new FooMachine('A');
        mock_states(this.machine, ['A', 'B']);
        return this.machine.setState('B');
      });
      it("should trigger the state to state transition", function() {
        return expect(this.machine.A_B.calledOnce).to.be.ok;
      });
      it("should trigger the state exit transition", function() {
        return expect(this.machine.A_exit.calledOnce).to.be.ok;
      });
      it("should trigger the transition to the new state", function() {
        return expect(this.machine.B_enter.calledOnce).to.be.ok;
      });
      it("should trigger the transition to \"Any\" state", function() {
        return expect(this.machine.A_any.calledOnce).to.be.ok;
      });
      it("should trigger the transition from \"Any\" state", function() {
        return expect(this.machine.any_B.calledOnce).to.be.ok;
      });
      it('should set the correct state', function() {
        return expect(this.machine.state()).to.eql(['B']);
      });
      return it("should remain the correct order", function() {
        var order;
        order = [this.machine.A_exit, this.machine.A_B, this.machine.A_any, this.machine.any_B, this.machine.B_enter];
        return assert_order(order);
      });
    });
    describe("when single to multi state transition", function() {
      beforeEach(function() {
        this.machine = new FooMachine('A');
        mock_states(this.machine, ['A', 'B', 'C']);
        return this.machine.setState(['B', 'C']);
      });
      it("should trigger the state to state transitions", function() {
        expect(this.machine.A_B.calledOnce).to.be.ok;
        return expect(this.machine.A_C.calledOnce).to.be.ok;
      });
      it("should trigger the state exit transition", function() {
        return expect(this.machine.A_exit.calledOnce).to.be.ok;
      });
      it("should trigger the transition to new states", function() {
        expect(this.machine.B_enter.calledOnce).to.be.ok;
        return expect(this.machine.C_enter.calledOnce).to.be.ok;
      });
      it("should trigger the transition to \"Any\" state", function() {
        return expect(this.machine.A_any.calledOnce).to.be.ok;
      });
      it("should trigger the transition from \"Any\" state", function() {
        expect(this.machine.any_B.calledOnce).to.be.ok;
        return expect(this.machine.any_C.calledOnce).to.be.ok;
      });
      it('should set the correct state', function() {
        return expect(this.machine.state()).to.eql(['B', 'C']);
      });
      return it("should remain the correct order", function() {
        var order;
        order = [this.machine.A_exit, this.machine.A_B, this.machine.A_C, this.machine.A_any, this.machine.any_B, this.machine.B_enter, this.machine.any_C, this.machine.C_enter];
        return assert_order(order);
      });
    });
    describe("when multi to single state transition", function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A', 'B']);
        mock_states(this.machine, ['A', 'B', 'C']);
        return this.machine.setState(['C']);
      });
      it("should trigger the state to state transitions", function() {
        expect(this.machine.B_C.calledOnce).to.be.ok;
        return expect(this.machine.A_C.calledOnce).to.be.ok;
      });
      it("should trigger the state exit transition", function() {
        expect(this.machine.A_exit.calledOnce).to.be.ok;
        return expect(this.machine.B_exit.calledOnce).to.be.ok;
      });
      it("should trigger the transition to the new state", function() {
        return expect(this.machine.C_enter.calledOnce).to.be.ok;
      });
      it("should trigger the transition to \"Any\" state", function() {
        expect(this.machine.A_any.calledOnce).to.be.ok;
        return expect(this.machine.B_any.calledOnce).to.be.ok;
      });
      it("should trigger the transition from \"Any\" state", function() {
        return expect(this.machine.any_C.calledOnce).to.be.ok;
      });
      it('should set the correct state', function() {
        return expect(this.machine.state()).to.eql(['C']);
      });
      return it("should remain the correct order", function() {
        var order;
        order = [this.machine.A_exit, this.machine.A_C, this.machine.A_any, this.machine.B_exit, this.machine.B_C, this.machine.B_any, this.machine.any_C, this.machine.C_enter];
        return assert_order(order);
      });
    });
    describe("when multi to multi state transition", function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A', 'B']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        return this.machine.setState(['D', 'C']);
      });
      it("should trigger the state to state transitions", function() {
        expect(this.machine.A_C.calledOnce).to.be.ok;
        expect(this.machine.A_D.calledOnce).to.be.ok;
        expect(this.machine.B_C.calledOnce).to.be.ok;
        return expect(this.machine.B_D.calledOnce).to.be.ok;
      });
      it("should trigger the state exit transition", function() {
        expect(this.machine.A_exit.calledOnce).to.be.ok;
        return expect(this.machine.B_exit.calledOnce).to.be.ok;
      });
      it("should trigger the transition to the new state", function() {
        expect(this.machine.C_enter.calledOnce).to.be.ok;
        return expect(this.machine.D_enter.calledOnce).to.be.ok;
      });
      it("should trigger the transition to \"Any\" state", function() {
        expect(this.machine.A_any.calledOnce).to.be.ok;
        return expect(this.machine.B_any.calledOnce).to.be.ok;
      });
      it("should trigger the transition from \"Any\" state", function() {
        expect(this.machine.any_C.calledOnce).to.be.ok;
        return expect(this.machine.any_D.calledOnce).to.be.ok;
      });
      it('should set the correct state', function() {
        return expect(this.machine.state()).to.eql(['D', 'C']);
      });
      return it("should remain the correct order", function() {
        var order;
        order = [this.machine.A_exit, this.machine.A_D, this.machine.A_C, this.machine.A_any, this.machine.B_exit, this.machine.B_D, this.machine.B_C, this.machine.B_any, this.machine.any_D, this.machine.D_enter, this.machine.any_C, this.machine.C_enter];
        return assert_order(order);
      });
    });
    describe("when transitioning to an active state", function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A', 'B']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        return this.machine.setState(['A']);
      });
      it('shouldn\'t trigger transition methods', function() {
        expect(this.machine.A_exit.called).not.to.be.ok;
        expect(this.machine.A_any.called).not.to.be.ok;
        return expect(this.machine.any_A.called).not.to.be.ok;
      });
      return it('shouldn\'t remain in the requested state', function() {
        return expect(this.machine.state()).to.eql(['A']);
      });
    });
    describe('when order is defined by the depends attr', function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A', 'B']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        this.machine.state_C.depends = ['D'];
        this.machine.state_A.depends = ['B'];
        return this.machine.setState(['C', 'D']);
      });
      describe('when entering', function() {
        return it('should handle dependand states first', function() {
          var order;
          order = [this.machine.A_D, this.machine.A_C, this.machine.any_D, this.machine.D_enter, this.machine.any_C, this.machine.C_enter];
          return assert_order(order);
        });
      });
      return describe('when exiting', function() {
        return it('should handle dependand states last', function() {
          var order;
          order = [this.machine.B_exit, this.machine.B_D, this.machine.B_C, this.machine.B_any, this.machine.A_exit, this.machine.A_D, this.machine.A_C, this.machine.A_any];
          return assert_order(order);
        });
      });
    });
    describe('when one state blocks another', function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A', 'B']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        this.machine.state_C = {
          blocks: ['D']
        };
        return this.machine.setState('D');
      });
      describe('and they are set simultaneously', function() {
        beforeEach(function() {
          return this.ret = this.machine.setState(['C', 'D']);
        });
        it('should skip the second state', function() {
          return expect(this.machine.state()).to.eql(['C']);
        });
        it('should return false', function() {
          return expect(this.machine.state()).to.eql(['C']);
        });
        return afterEach(function() {
          return delete this.ret;
        });
      });
      return describe('and blocking one is added', function() {
        return it('should unset the blocked one', function() {
          this.machine.addState(['C']);
          return expect(this.machine.state()).to.eql(['C']);
        });
      });
    });
    describe('when state is implied', function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        this.machine.state_C = {
          implies: ['D']
        };
        this.machine.state_A = {
          blocks: ['D']
        };
        return this.machine.setState(['C']);
      });
      it('should be activated', function() {
        return expect(this.machine.state()).to.eql(['C', 'D']);
      });
      return it('should be skipped if blocked at the same time', function() {
        this.machine.setState(['A', 'D']);
        return expect(this.machine.state()).to.eql(['A']);
      });
    });
    describe('when state requires another one', function() {
      beforeEach(function() {
        this.machine = new FooMachine(['A']);
        mock_states(this.machine, ['A', 'B', 'C', 'D']);
        return this.machine.state_C = {
          requires: ['D']
        };
      });
      it('should be set when required state is active', function() {
        this.machine.setState(['C', 'D']);
        return expect(this.machine.state()).to.eql(['C', 'D']);
      });
      return it('should\'t be set when required state isn\'t active', function() {
        this.machine.setState(['C', 'A']);
        return expect(this.machine.state()).to.eql(['A']);
      });
    });
    return describe('when state is changed', function() {
      describe('and transition is canceled', function() {
        return it('should return false');
      });
      describe('and any transition is async', function() {
        return it('should return null');
      });
      return it('should return true');
    });
  });

}).call(this);
