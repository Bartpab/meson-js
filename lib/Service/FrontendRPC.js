class FrontendRPCService {
    constructor () {
        this._pipeline = null;
        this._stack = [];

        this._runningPromises = {};
        this._heartbeatPromises = {};

        this._counter = 0;
    };

    bind (pipeline) {
        this._pipeline = pipeline;
        this.flush();
    };
    onConnectionClosed (reason) {

    };
    flush () {
        if (this._pipeline === null){ 
            return;
        }

        while (this._stack.length > 0) {
            var request = this._stack.shift();
            this._pipeline.request(
                request.ticket, 
                request.methodName, 
                request.args
            );
        }
    };

    send (request) {
        if (this._pipeline === null) {
            this._stack.push(request);
        } else {
            this._pipeline.request(
                request.methodName, 
                request.args, 
                request.ticket
            );
        }
    };

    onRPCOut (ticket) {
        var entry = this._heartbeatPromises[ticket];
        if (entry === undefined) return;
        entry.reject('The RPC is not managed by the backend, either because it has failed, or it has never been received...');
        delete this._heartbeatPromises[ticket];
    };

    onRPCStill (ticket) {
        var entry = this._heartbeatPromises[ticket];
        if (entry === undefined) return;
        entry.resolve('The RPC is still running.');
        delete this._heartbeatPromises[ticket];
    };

    onResultReceived (ticket, result, error) {
        var entry = this._runningPromises[ticket];
        if (entry === undefined) return;
        if (error !== null) {
            entry.reject(error);
        } else {
            entry.resolve(result);
        }
        delete this._runningPromises[ticket];
    };

    rpc_stub (methodName, timeout) {
        return function () {
            var args = Array.prototype.slice.call(arguments, 0);
            return this.rpc(methodName, args, timeout);
        }.bind(this);
    };
    
    requestRPCHeartbeat (ticket) {
        if (this._runningPromises[ticket] === null) {
            delete this._heartbeatPromises[ticket];
            return;
        }

        if (this._pipeline === null) {
            setTimeout(function () {
                this.requestRPCHeartbeat(ticket);
            }.bind(this), 3000);
            return;
        }
        console.log('RPC heartbeat for ' + ticket);
        var promise = new Promise(function (resolve, reject){
            this._heartbeatPromises[ticket] = {
                resolve, reject
            };
            setTimeout(reject, 15000, 'Heartbeat timeout.');
        }.bind(this));
        
        // Schedule another hb
        promise.then(function () {
            setTimeout(function () {
                this.requestRPCHeartbeat(ticket);
            }.bind(this), 3000);
        }.bind(this)).catch(function (error) {
            var entry = this._runningPromises[ticket];
            if (entry === undefined) return;
            console.log('RPC heartbeat failed because ' + error);
            entry.reject(error);
        }.bind(this));
        
        this._heartbeatPromises[ticket].promise = promise;
        this._pipeline.sendHeartbeatRequest(ticket);
    };

    rpc (methodName, args, timeout) {
        this._counter += 1;
        var request = {
          ticket: this._counter,
          methodName: methodName,
          args: args
        };

        let promise = new Promise(function (resolve, reject) {
            this._runningPromises[request.ticket] = {
                resolve, reject
            };

            if (timeout !== undefined) {
                setTimeout(reject, timeout, 'RPC ' + methodName + ' has timeout.');
            }

            // Heartbeat
            setTimeout(function () {
                this.requestRPCHeartbeat(request.ticket);
            }.bind(this), 3000);

        }.bind(this));

        promise.then(function (result) {
            console.log('RPC ' + request.ticket + ' has been fullfilled.');
        }).catch(function (error) {
            console.error(error);
        });


        this._runningPromises[request.ticket].promise = promise;
        this.send(request);

        return promise;
    };
};

module.exports.FrontendRPCService = FrontendRPCService;