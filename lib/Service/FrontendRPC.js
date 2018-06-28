class FrontendRPCService {
    constructor () {
        this._pipeline = null;
        this._stack = []

        this._runningPromises = {};
        this._counter = 0;
    };

    bind (pipeline) {
        this._pipeline = pipeline;
        this.unstack();
    };

    unstack () {
        if (this._pipeline === null) return;
        while (this._stack.length > 0) {
            request = this._stack.shift();
            this._pipeline.request(request.ticket, request.methodName, request.args)
        }
    };

    send (request) {
        if (this._pipeline === null) {
            this._stack.push(request)
        } else {
            this._pipeline.request(request.ticket, request.methodName, request.args)
        }
    };

    onResultReceived (ticket, result, error) {
        var entry = this._runningPromises[ticket];
        if (entry === undefined) return;
        
        if (error !== null) {
            entry.reject(error);
        } else {
            entry.resolve(result)
        }
        delete this._runningPromises[ticket];
    };

    rpc (methodName, args) {
        this._counter += 1;
        var request = {
          ticket: this._counter,
          methodName: methodName,
          args: args
        };

        let promise = new Promise(function (resolve, reject) {
            this._runningPromises[request.ticket] = {
                resolve, reject
            }
        });

        this._runningPromises[request.ticket].promise = promise;
        this.send(request);

        return promise;
    };
};