'use strict';

var AsyncQueue = function () {
    this.arr = [];
    this.resolve_promise = null;

    this.get = function () {
        let self = this;
        if (self.arr.length > 0) {
            return Promise.resolve(self.arr.shift());
        } else {
            return new Promise(function (resolve, reject) {
                self.resolve_promise = resolve;
            });
        }
    };

    this.put = function (el) {
        if (this.resolve_promise !== null) {
            this.resolve_promise(el);
        } else {
            this.arr.push(el);
        }
    };
};

module.exports = AsyncQueue;
