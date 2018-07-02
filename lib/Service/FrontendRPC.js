class FrontendRPCService {
    constructor () {
        this._pipeline = null;
        this._stack = [];

        this._runningPromises = {};
        this._heartbeatPromises = {};
        this._runningTimers = {};

        this._counter = 0;

        this._isOpened = false;
        this._isClosed = false;
    };

    bind (pipeline) {
        this._pipeline = pipeline;
    };
    
    onConnectionClosed (reason) {
        this._isOpened = false;
        this._isClosed = true;
    };
    
    onConnectionReady () {
        this._isOpened = true;
        this.flush();
    };

    isReady () {
        return this._isOpened;
    };

    hasBeenClosed () {
        return this._isClosed;
    };

    flush () {
        if (!this.isReady()){ 
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
        if (!this.isReady()) {
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

        if (!this.isReady()) {
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
            this.scheduleHeartbeat(ticket);
        }.bind(this)).catch(function (error) {
            var entry = this._runningPromises[ticket];
            if (entry === undefined) return;
            console.log('RPC heartbeat failed because ' + error);
            entry.reject(error);
        }.bind(this));
        
        this._heartbeatPromises[ticket].promise = promise;
        this._pipeline.sendHeartbeatRequest(ticket);
    };

    scheduleHeartbeat (ticket) {
        this._runningTimers[ticket] = setTimeout(function () {
            this.requestRPCHeartbeat(ticket);
        }.bind(this), 3000);
    };

    clear (ticket) {
        var entry = this._runningTimers[ticket];
        if (entry === undefined) return;
        clearTimeout(entry);
        delete this._runningTimers[ticket];
    };

    rpc (methodName, args, timeout) {
        if (this.hasBeenClosed()) {
            return Promise.reject('The service is currently closed.');
        }

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
            this.scheduleHeartbeat(request.ticket);

        }.bind(this));

        promise.then(function (result) {
            console.log('RPC ' + request.ticket + ' has been fullfilled.');
            this.clear(request.ticket);
        }.bind(this)).catch(function (error) {
            console.error(error);
        });


        this._runningPromises[request.ticket].promise = promise;
        this.send(request);

        return promise;
    };
};

module.exports.FrontendRPCService = FrontendRPCService;