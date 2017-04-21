var Task = function () {
    this.done   = null;
    this.cancel = null;
    this.promise = new Promise(function(resolve, reject) {
        this.done = resolve;
        this.cancel = reject;
    }.bind(this));
};

module.exports = Task;
