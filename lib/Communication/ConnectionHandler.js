var Pipeline = require('./Pipeline').Pipeline;

class RootPipeline extends Pipeline {
    constructor (handler) {
        super();
        this._handler = handler;
    }; 
    
    handler () {
        return this._handler;
    };

    interceptOutcoming (interceptor) {
        this.handler().send(interceptor.get());
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
        this._queue = new BufferQueue(10);
        this._outBuffer = new BufferQueue(10);
        this._recPromise = null;
        this._recPromise_resolve = null;
        this._recPromise_reject = null;
        this._rootPipeline = new RootPipeline(this);

        this._listeners = {
            'close': []
        };

        this.bind(ws);
    };
    // Root pipeline
    getRootPipeline () {
        return this._rootPipeline;
    };
    
    on (event, callback) {
        this._listeners[event].push(callback);
    };

    emit (event) {
        this._listeners[event].forEach(function (listener) {
            listener();
        });
    };

    close () {
        if (this.isClosed() !== false) {
            this._ws.close();
            this.emit("close");
        }
    };

    isClosed () {
        return this._ws == 3;
    };

    bind (websocket) {
        this._ws = websocket;
        this.flush_outBuffer();

        websocket.on('close', function (reason) {
            this.getRootPipeline().onClosed(reason);
            if (this._recPromise_reject !== null) {
                this._recPromise_reject(reason);
                this._recPromise = null;
                this._recPromise_resolve = null;
                this._recPromise_resolve = null;
            }
            this.emit("close");
        }.bind(this));

        websocket.onmessage = function (frame) {
            var message = frame.data;
            this.getRootPipeline().inPush(message);
            if (this._recPromise_resolve !== null) {
                this._recPromise_resolve(message);
                this._recPromise = null;
                this._recPromise_resolve = null;
                this._recPromise_resolve = null;
            } else {
                this._queue.push(message);
            }
        }.bind(this);
    };

    flush_outBuffer () {
        while (this._outBuffer.size() > 0) {
            var message = this._outBuffer.pop();
            this._ws.send(message);
        }
    };

    send (message) {
        if (this._ws === null) {
            this._outBuffer.push(message);
        } else {
            this._ws.send(message);
        }
    };
    recv(timeout) {
        if (this._queue.size() > 0) {
            return this._queue.pop();
        }

        if (this._recPromise === null) {
            this._recPromise = new Promise(function (resolve, reject) {
                this._recPromise_resolve = resolve;
                this._recPromise_reject = reject;
            }.bind(this));
        }
        
        let promise = this._recPromise;

        if (timeout !== undefined) {
            promise = new Promise(function (resolve, reject) {
                this._recPromise.then(function (result) {
                    resolve(result);
                }).catch(function (error) {
                    reject(error);
                });
                setTimeout(reject, timeout, 'Timeout after ' + timeout + ' ms.');
            }.bind(this));
        }

        return promise;
    };
};

module.exports.ConnectionHandler = ConnectionHandler;