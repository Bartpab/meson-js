/* global describe, it */

var expect = require('chai').expect
var mesonJs = require('./index')

describe('meson js', function () {
  it('should export a function', function () {
    expect(mesonJs).to.be.a('function')
  })
})
