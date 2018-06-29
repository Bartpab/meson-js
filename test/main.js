var meson = require('../lib/index')
var co = require('co')

var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect
var assert = chai.assert

describe('#frontendApplication', function () {
    this.timeout(150000)
    it('should spawn a backend process and connect to it', function () {
        var app = new meson.LocalFrontendApplication('app.test', 'test_server', 'test_client');

        var done
        var cancel

        var assertPromise = new Promise(function(resolve, reject) {
             done = resolve
             cancel = reject
        })

        app.start(__dirname, 'backend', 'main.py', 4242).then(function () {
            var executionPromise = co.wrap(function* (app) {
                console.log('Run RPCs');
                console.log('Run add2(2,1)');
                var add2 = app.rpc_stub('add2')
                sum = yield add2(2, 1)
                assert.strictEqual(sum, 3, 'RPC returned value is not the expected one')

                var hello = app.rpc_stub('hello')
                yield hello()

                done()
            })(app).catch((error) => {
                console.log(error)
                cancel(error)
            })
        }).catch((error) => {
            console.log(error)
            cancel(error)
        })
        return assert.isFulfilled(assertPromise)
    })
})
