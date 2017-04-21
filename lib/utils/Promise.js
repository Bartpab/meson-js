var PromiseStatusAwareness = function(promise) {
    this.isResolved = false;
    this.isRejected = false;
    this.hadFailed = false;

    promise.then(() => {
        this.isResolved = true;
    }, () => {
        this.isRejected = true;
    }).catch(() => {
        this.hadFailed = true;
    });

    this.isFinished = function () {
        return (this.isResolved || this.isRejected || this.hadFailed);
    };
};

module.exports.PromiseStatusAwareness = PromiseStatusAwareness;
