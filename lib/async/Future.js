var co = require('co');
var coroutine = require('./Coroutine');

var Future = function () {
    this._error = null;
    this._result = null;

    this.internalPromise = new Promise(function (resolve, reject) {
        this.done = resolve;
        this.cancel = reject;
    }.bind(this));

    this.set_result = function(result) {
        this._result = result;
        this.done();
    };

    this.result = function () {
        console.log(this._error)
        if (this._error != null){
            throw this._error;
        }
        return this._result;
    };

    this.throw = function(error) {
        this._error = error;
        this.done();
    };

    this.promise = co.wrap(function* (self) {
        yield self.internalPromise;
        return self.result();
    })(this);
};

module.exports = Future;
