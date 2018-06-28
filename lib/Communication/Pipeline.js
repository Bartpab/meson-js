
var crypto = require('crypto');

class PipelineBuilder {
    constructor (root) {
        this._chain = [root];
    };

    add (pipeline) {
        this._chain.push(pipeline);
    };

    getChain () {
        return this._chain;
    };

    build () {
        var parent = null;
        this.getChain().forEeach(function (pipeline) {
            if (parent !== null) {
                pipeline.setParent(parent)
            }
            parent = pipeline;
        });
        return this.getChain()[0];
    };
};
class PipelineInterceptor {
    constructor (value) {
        this._value = value;
        this._continue = true;
    };

    set (newValue) {
        this._value = newValue;
    };
    get () {
        return this._value;
    };

    shouldStopPropagation () {
        return !this._continue
    };
    stopPropagation () {
        this._continue = false
    };
};

class Pipeline {
    constructor () {
        this._parent = null
        this._childs = []
    };

    getChilds () {
        return this._childs;
    }
    addChild (child) {
        this._childs.push(child);
    };

    setParent (parent) {
        this._parent = parent;
        this._parent.addChild(this)
    };
    getParent () {
        return this._parent;
    };

    interceptIncoming (interceptor) {};
    interceptOutcoming (interceptor) {};
    interceptClose (reason) {};

    onIncoming(interceptor) {
        this.interceptIncoming(interceptor);

        if (!interceptor.shouldStopPropagation()) {
            this.getChilds().forEach(function (childPipeline) {
                childPipeline.onIncoming(interceptor);
            });
        }
    };

    onOutcoming(interceptor) {
        this.interceptOutcoming(interceptor);
        if (!interceptor.shouldStopPropagation() && this.getParent() !== null) {
            this.getParent().onOutcoming(interceptor)
        }
    };

    onClosed (reason) {
        this.interceptClose()
        this.getChilds().forEach(function (childPipeline) {
            childPipeline.onClosed(reason);
        });
    }

    inPush (value) {
        var interceptor = new PipelineInterceptor(value);
        this.onIncoming(interceptor);
    };

    outPush (value) {
        var interceptor = new PipelineInterceptor(value);
        this.onOutcoming(interceptor);
    };
};

class SecurityPipeline extends Pipeline {
    constructor (bKey, bIv) {
        super();
        this._bKey = bKey;
        this._bIv = bIv;
    };

    interceptIncoming (interceptor) {
        var decipher = crypto.createDecipheriv('aes-256-cbc', this._bKey, this._bIv);
        var hexStr = interceptor.get();
        var buffer = Buffer.from(hexStr, 'hex');
        var decoded = Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf-8');
        interceptor.set(decoded);
    };

    interceptOutcoming (interceptor) {
        var cipher = crypto.createCipheriv('aes-256-cbc', this._bKey, this._bIv);
        var encryptedData = cipher.update(interceptor.get(), 'utf8', 'hex') + cipher.final('hex');
        interceptor.set(encryptedData);
    };
};

class SerializerPipeline extends Pipeline {
    constructor () {};

};

class FrontendRPCPipeline extends Pipeline {
    constructor (rpcService) {
        this._rpcService = rpcService;
        this._rpcService.bind(this);

        this._executionPromises = {};
        this._counter = 0;
    };

    request (methodName, args, ticket) {
        this.outPush({
            '__ticket__': ticket,
            '__operation__': 'RPC',
            '__payload__': {
                'method': methodName,
                'args': args
            }
        })
    };

    result (ticket, result, error) {
        this._rpcService.onResultReceived(ticket, result, error);
    };

    check (header, normalized) {
        return normalized[header] !== undefined;
    };

    interceptIncoming (interceptor) {
        var keep = True;
        result = interceptor.get();

        keep = keep && this.check('__operation__', result) && result['__operation__'] === 'RPC';
        keep = keep && this.check('__ticket__', result);
        keep = keep && this.check('__return__', result);
        keep = keep && this.check('__error__', result);

        if (keep) {
            this.result(request['__ticket__'], request['__return__'], request['__error__']);
            interceptor.stopPropagation();
        }
    };

    interceptClose (reason) {
        this._rpcService.onConnectionClosed(reason);
    };
};

module.exports.PipelineInterceptor = PipelineInterceptor;
module.exports.Pipeline = Pipeline;
module.exports.SecurityPipeline = SecurityPipeline;
module.exports.FrontendRPCPipeline = FrontendRPCPipeline;