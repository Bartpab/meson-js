var coroutine = function (gen, args) {
    let cor = gen.apply(null, args);
    cor.next();
    return cor;
};

module.exports = coroutine;
