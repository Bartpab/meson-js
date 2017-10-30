'use strict';

var co = require('co');

var PromiseStatusAwareness = require('../utils/Promise').PromiseStatusAwareness;
var AsyncQueue = require('../async/Queue');
var IncomingPipeline = require('./Incoming').IncomingPipeline;
var OutcomingPipeline = require('./Outcoming').OutcomingPipeline;

var CommunicationPipeline = function (websocket, server_secret, client_secret) {
    this.STATUS_UNBOUND = 0;
    this.STATUS_BOUND = 1;
    this.STATUS_CLOSED = 2;

    this.server_secret = server_secret;
    this.client_secret = client_secret;

    this.status = this.STATUS_UNBOUND;

    this.recvQueue = new AsyncQueue();
    this.sendQueue = new AsyncQueue();

    this.consumeStatus = null;
    this.consumePromise = null;
    this.produceStatus = null;
    this.producePromise = null;

    this.recvCoroutines = [];

    this.callbacks = {
        'close': []
    };

    // Will stop the step yielding
    this.breakTrigger = new Promise(function(resolve, reject) {
        this.break = resolve;
    }.bind(this));

    this.breakTriggerStatus = new PromiseStatusAwareness(this.breakTrigger);

    websocket.onerror = function (reasonCode, description) {
        console.log(description);
    };

    websocket.on('close', function close() {
      console.log('disconnected');
      this.close('');
    });

    websocket.onmessage = function (message) {
        this.recvQueue.put(message.data);
    }.bind(this);

    console.log('[Meson] Listening to websocket');

    this.on = function(eventType, callback) {
        this.callbacks[eventType].push(callback);
    };

    this.recv = function () {
        return this.recvQueue.get();
    };
    this.send = function (sendTask) {
        this.sendQueue.put(sendTask);
    };

    this.consume = function* (self) {
        let recv = yield self.recvQueue.get();
        for (var co of self.recvCoroutines) {
            co.next(recv);
        }
        return 'consumed';
    };

    this.produce = function* (self) {
        let sendTask = yield self.sendQueue.get();
        let sendMsg = sendTask.message;
        websocket.send(sendMsg);
        sendTask.done();
        return 'produced';
    };

    this.step = function () {
        if (!this.isBound()) {
            throw Error('[Meson] Pipeline is not bound!');
        }
        if(this.isClosed()) {
            throw Error('[Meson] Pipeline is closed!');
        }

        // Reload the break trigger
        if (this.breakTriggerStatus.isFinished) {
            this.breakTrigger = new Promise(function(resolve, reject) {
                this.break = resolve;
            }.bind(this));
            this.breakTriggerStatus = new PromiseStatusAwareness(this.breakTrigger);
        }

        if (this.consumeStatus === null || this.consumeStatus.isFinished) {
            this.consumePromise = co.wrap(this.consume)(this);
            this.consumeStatus = new PromiseStatusAwareness(this.consumePromise);
        }
        if (this.produceStatus === null || this.produceStatus.isFinished) {
            this.producePromise = co.wrap(this.produce)(this);
            this.produceStatus = new PromiseStatusAwareness(this.producePromise);
        }

        return Promise.race([this.consumePromise, this.producePromise, this.breakTrigger]);
    };

    this.bind = function () {
        return co.wrap(function* (pipeline) {
            let salt = yield pipeline.recv();

            websocket.send('handshake');

            let recv = yield pipeline.recv();

            if (recv === 'handshake') {
                websocket.send('json');
            } else {
                throw 'Handshake wrong.';
            }

            pipeline.incoming = new IncomingPipeline(pipeline);
            pipeline.outcoming = new OutcomingPipeline(pipeline);

            pipeline.status = pipeline.STATUS_BOUND;

            return pipeline;
        })(this);
    };

    this.isBound = function () {
        return this.status === this.STATUS_BOUND;
    };
    this.isClosed = function (){
        return this.status === this.STATUS_CLOSED;
    };
    this.close = function (reason) {
        console.log('[Meson] Socket closed, reason=' + reason);
        if (this.isClosed()){
            return null;
        }
        if (!this.breakTriggerStatus.isFinished) {
            this.break();
        }

        this.status = this.STATUS_CLOSED;

        for(var callback of this.callbacks.close){
            callback(reason);
        }
    };
};

module.exports = CommunicationPipeline;
