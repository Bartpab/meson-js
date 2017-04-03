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
        var app = new meson.LocalFrontendApplication()
        var done
        var cancel

        var assertPromise = new Promise(function(resolve, reject) {
             done = resolve
             cancel = reject
        })

        app.start(__dirname, 'backend', 'main.py', 4242).then(function () {
            var runPromise = co.wrap(function* () {
                yield app.run()
            })(app)
            var executionPromise = co.wrap(function* (app) {
                console.log('Run RPCs')
                var add2 = app.rpc_stub('add2')
                var sum = yield add2(2, 1)
                console.log(sum)
                assert.strictEqual(sum, 4, 'RPC returned value is not the expected one')
                app.exit()
                done()
            })(app)
        }).catch((error) => {
            cancel(error)
        })
        return assert.isFulfilled(assertPromise)
    })
})
