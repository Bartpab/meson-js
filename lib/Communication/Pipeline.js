'use strict';

var co = require('co');
var jwt = require('jwt-simple');
var PromiseStatusAwareness = require('../utils/Promise').PromiseStatusAwareness;
var AsyncQueue = require('../async/Queue');
var IncomingPipeline = require('./Incoming').IncomingPipeline;
var OutcomingPipeline = require('./Outcoming').OutcomingPipeline;
var crypto = require('crypto');

var CommunicationPipeline = function (websocket, app_id, server_secret, client_secret) {
    this.STATUS_UNBOUND = 0;
    this.STATUS_BOUND = 1;
    this.STATUS_CLOSED = 2;

    this.server_secret = server_secret;
    this.client_secret = client_secret;
    this.app_id        = app_id;

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

            console.log({app_id: pipeline.app_id, salt: salt});

            let clientKey = crypto.pbkdf2Sync(pipeline.client_secret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');

            console.log(clientKey);

            let token = JSON.stringify({app_id: pipeline.app_id, salt: salt});
            let iv = Buffer.concat([crypto.randomBytes(12), Buffer.alloc(4, 0)]);

            let cipher = crypto.createCipheriv('aes-256-cbc', clientKey, iv);
            var encryptedRequest = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');

            let request = 'REQUEST ' + encryptedRequest + ' WITH ' + iv.toString('hex');

            console.log("[Meson] Send request to " + pipeline.app_id);
            websocket.send(request);

            let encodedReplyToken = yield pipeline.recv();

            let re = /REPLY (.*) WITH (.*)/g;
            let m = re.exec(encodedReplyToken);
            let encodedReply = m[1];

            let serverKey = crypto.pbkdf2Sync(pipeline.server_secret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');
            let serverIV = new Buffer(m[2], 'hex');

            let decipher = crypto.createDecipheriv('aes-256-cbc', serverKey, serverIV);
            let replyToken = decipher.update(encodedReply,'hex','utf8') + decipher.final('utf8');
            let reply = JSON.parse(replyToken);

            console.log("[Meson] The request was approved by " + pipeline.app_id);

            pipeline.sessionKey = new Buffer(reply['key'], 'hex');
            pipeline.sessionIV  = new Buffer(reply['iv'], 'hex');

            console.log("[Meson] Secure key defined");
            websocket.send('json');

            pipeline.incomingPipeline   = new IncomingPipeline(pipeline);
            pipeline.outcomingPipeline  = new OutcomingPipeline(pipeline);

            // Used for handlers
            pipeline.incoming = pipeline.incomingPipeline.root;
            pipeline.outcoming = pipeline.outcomingPipeline.root;

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
