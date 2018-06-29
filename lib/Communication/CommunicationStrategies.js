var co = require('co');
var crypto = require('crypto');
var Pipelines = require('./Pipeline');

var FrontendRPCPipeline = Pipelines.FrontendRPCPipeline;
var SerializerPipeline = Pipelines.SerializerPipeline;
var SecurityPipeline = Pipelines.SecurityPipeline;

class CommunicationStrategy {
    constructor () {};

    newConnection (connectionHandler, pipelineBuilder) {
        return true;
    };
};

class SecuredFrontendCommunicationStrategy extends CommunicationStrategy {
    constructor (app_id, server_secret, client_secret) {
        super();
        this.app_id = app_id;
        this.clientSecret = client_secret;
        this.serverSecret = server_secret;
    };

    utf8_encode (str) {
        return JSON.parse( JSON.stringify( str ) );
    };

    newConnection (connectionHandler, pipelineBuilder) {
        return co.wrap(function * (self) {
            var salt = yield connectionHandler.recv(30000); // Timeout after 30s

            var clientKey = crypto.pbkdf2Sync(self.clientSecret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');
            var token = JSON.stringify({app_id: self.app_id, salt: salt});
            var iv = Buffer.concat([crypto.randomBytes(12), Buffer.alloc(4, 0)]);
    
            var cipher = crypto.createCipheriv('aes-256-cbc', clientKey, iv);
            var encryptedRequest = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
    
            var request = 'REQUEST ' + encryptedRequest + ' WITH ' + iv.toString('hex');
            request = self.utf8_encode(request);

            console.log("[Meson] Send request to " + self.app_id);
            connectionHandler.send(request);
            
            console.log("[Meson] Waiting for reply from " + self.app_id);
            var encodedReplyToken = yield connectionHandler.recv();
            console.log("[Meson] Received reply from " + self.app_id);

            var re = /REPLY (.*) WITH (.*)/g;
            var m = re.exec(encodedReplyToken);
            var encodedReply = m[1];
    
            var serverKey = crypto.pbkdf2Sync(self.serverSecret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');
            var serverIV = new Buffer(m[2], 'hex');
    
            var decipher = crypto.createDecipheriv('aes-256-cbc', serverKey, serverIV);
            var replyToken = decipher.update(encodedReply,'hex','utf8') + decipher.final('utf8');
            var reply = JSON.parse(replyToken);
    
            console.log("[Meson] The request was approved by " + self.app_id);
            
            pipelineBuilder.add(new SecurityPipeline(new Buffer(reply['key'], 'hex'), new Buffer(reply['iv'], 'hex')));

            console.log("[Meson] Secure key defined");
            return true;
        })(this);
    };
};

class SerializerStrategy extends CommunicationStrategy {
    constructor () {
        super();
    };

    newConnection (connectionHandler, pipelineBuilder) {
        return new Promise (function (resolve, reject) {
            pipelineBuilder.add(new SerializerPipeline());
            resolve(true);
        });
    };
};

class FrontendRPCCommunicationStrategy extends CommunicationStrategy {
    constructor (frontendRPCService) {
        super();
        this._service = frontendRPCService;
    };

    getService() {
        return this._service;
    };

    newConnection (connectionHandler, pipelineBuilder) {
        return new Promise (function (resolve, reject) {
            pipelineBuilder.add(new FrontendRPCPipeline(this.getService()));
            resolve(true);
        }.bind(this));
    };
};

class AggregatedCommunicationStrategy extends CommunicationStrategy {
    constructor () {
        super();
        this._queue = [];
    };

    queue () {
        return this._queue;
    };

    push (strategy) {
        this._queue.push(strategy);
        return this;
    };
    
    newConnection (connectionHandler, pipelineBuilder) {
        return co.wrap(function * (self) {
            var keepConnected = true;
            for (let coStrat of self.queue()) {
                var subKc = yield coStrat.newConnection(connectionHandler, pipelineBuilder);
                keepConnected = keepConnected & subKc;
            }
            return keepConnected;
        })(this);
    };
};

module.exports.CommunicationStrategy = CommunicationStrategy;
module.exports.SecuredFrontendCommunicationStrategy = SecuredFrontendCommunicationStrategy;
module.exports.FrontendRPCCommunicationStrategy = FrontendRPCCommunicationStrategy;
module.exports.AggregatedCommunicationStrategy = AggregatedCommunicationStrategy;
module.exports.SerializerStrategy = SerializerStrategy;