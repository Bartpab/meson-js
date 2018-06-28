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
    constructor (client_secret, server_secret) {
        this.clientSecret = client_secret;
        this.serverSecret = server_secret;
    };

    newConnection (connectionHandler, pipelineBuilder) {
        return true;
    };
};

class FrontendRPCConnectionStrategy extends ConnectionStrategy {
    constructor (frontendRPCService) {
        this._service = frontendRPCService;
    };

    newConnection (connectionHandler, pipelineBuilder) {
        pipelineBuilder.add(FrontendRPCPipeline(this._service));
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