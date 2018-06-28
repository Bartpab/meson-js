var Pipeline = require('Pipeline').Pipeline;
var Pipeline = require('Pipeline').Pipeline;

class RootPipeline extends Pipeline {
    constructor (handler) {
        super();
        this._handler = handler;
    }
    
    handler () {
        return this._handler;
    };

    interceptOutcoming (interceptor) {
        this.handler().send(interceptor.get())
    };
};

class BufferQueue {
    constructor(max) {
        this.max = max;
        this._queue = [];
    };

    adjust () {
        while (this._queue.length > this.max) {
            this._queue.shift();
        }
    };

    size () {
        return this._queue.length;
    };

    push (element) {
        this._queue.push(element);
        this.adjust();
    };

    pop (element) {
        return this._queue.shift();
    };
};

class ConnectionHandler {
    constructor (ws) {
        this.bind(ws)
        this._queue = new BufferQueue(10);
        this._recPromise = null;
        this._recPromise_resolve = null;
        this._recPromise_reject = null;
        this._rootPipeline = new RootPipeline();
    };
    // Root pipeline
    getRootPipeline () {
        return this._rootPipeline;
    };

    close () {
        this._ws.close();
    };

    isClosed () {
        return this._ws == 3;
    };

    bind (websocket) {
        this._ws = ws
        ws.on('close', function (reason) {
            this.getRootPipeline().onClosed(reason);
            if (this._recPromise_reject !== null) {
                this._recPromise_reject(reason);
                this._recPromise = null;
                this._recPromise_resolve = null;
                this._recPromise_resolve = null;
            }
        });
        ws.onmessage = function (message) {
            this.getRootPipeline().inPush(message);
            if (this._recPromise_resolve !== null) {
                this._recPromise_resolve(reason);
                this._recPromise = null;
                this._recPromise_resolve = null;
                this._recPromise_resolve = null;
            } else {
                this._queue.push(message)
            }
        }.bind(this);
    };
    
    recv() {
        if (this._queue.size() > 0) {
            return this._queue.pop();
        }
        if (this._recPromise !== null) {
            return this._recPromise
        }
        this._recPromise = new Promise(function (resolve, reject) {
            this._recPromise_resolve = resolve;
            this._recPromise_reject = reject;
        })

        return this._recPromise;
    };
};

module.exports.ConnectionHandler = ConnectionHandler;