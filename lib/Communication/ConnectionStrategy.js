var co = require('co');
var crypto = require('crypto');
var FrontendRPCPipeline = require('Pipeline').FrontendRPCPipeline;
var SecurityPipeline = require('Pipeline').SecurityPipeline;

class ConnectionStrategy {
    constructor () {};

    newConnection (connectionHandler, pipelineBuilder) {
        return true;
    };
};

class SecuredFrontendConnectionStrategy extends ConnectionStrategy {
    constructor (app_id, client_secret, server_secret) {
        this.app_id = app_id
        this.clientSecret = client_secret;
        this.serverSecret = server_secret;
    };

    newConnection (connectionHandler, pipelineBuilder) {
        return co.wrap(function * (self) {
            var salt = yield pipeline.recv(30000); // Timeout after 30s

            var clientKey = crypto.pbkdf2Sync(self.clientSecret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');
            var token = JSON.stringify({app_id: self.app_id, salt: salt});
            var iv = Buffer.concat([crypto.randomBytes(12), Buffer.alloc(4, 0)]);
    
            var cipher = crypto.createCipheriv('aes-256-cbc', clientKey, iv);
            var encryptedRequest = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
    
            var request = 'REQUEST ' + encryptedRequest + ' WITH ' + iv.toString('hex');
    
            console.log("[Meson] Send request to " + self.app_id);
            websocket.send(request);
    
            var encodedReplyToken = yield connectionHandler.recv();
    
            var re = /REPLY (.*) WITH (.*)/g;
            var m = re.exec(encodedReplyToken);
            var encodedReply = m[1];
    
            var serverKey = crypto.pbkdf2Sync(self.serverSecret, new Buffer(salt, 'hex'), 1000, 32, 'sha1');
            var serverIV = new Buffer(m[2], 'hex');
    
            var decipher = crypto.createDecipheriv('aes-256-cbc', serverKey, serverIV);
            var replyToken = decipher.update(encodedReply,'hex','utf8') + decipher.final('utf8');
            var reply = JSON.parse(replyToken);
    
            console.log("[Meson] The request was approved by " + self.app_id);
            
            yield connectionHandler.recv(); // Wait for the OK signal
            pipelineBuilder.add(new SecurityPipeline(new Buffer(reply['key'], 'hex'), new Buffer(reply['iv'], 'hex')));

            console.log("[Meson] Secure key defined");
            return True;
        })(this)
    };
};

class FrontendRPCConnectionStrategy extends ConnectionStrategy {
    constructor (frontendRPCService) {
        this._service = frontendRPCService;
    };

    newConnection (connectionHandler, pipelineBuilder) {
        pipelineBuilder.add(new FrontendRPCPipeline(this._service));
        return true;
    };
};

class AggregatedConnectionStrategy extends ConnectionStrategy {
    constructor () {
        this._queue = [];
    };

    queue () {
        return this._queue
    };

    push (strategy) {
        this._queue.push(strategy)
    };
    
    newConnection (connectionHandler, pipelineBuilder) {
        return co.wrap(function * (self) {
            var keepConnected = True;
            self.queue().forEach(function (coStrat) {
                var subKc = yield coStrat.newConnection(connectionHandler, pipelineBuilder);
                keepConnected = keepConnected & subKc;
            });
            return keepConnected;
        })(this);
    };
};

module.exports.ConnectionStrategy = ConnectionStrategy;
module.exports.SecuredFrontendConnectionStrategy = SecuredFrontendConnectionStrategy;
module.exports.FrontendRPCConnectionStrategy = FrontendRPCConnectionStrategy;
module.exports.AggregatedConnectionStrategy = AggregatedConnectionStrategy;