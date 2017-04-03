var coroutine = function (gen, args) {
    cor = gen.apply(null, args)
    cor.next()
    return cor
}

module.exports = coroutine
