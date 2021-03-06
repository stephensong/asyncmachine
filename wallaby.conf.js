module.exports = function (wallaby) {
  return {
    files: [
      'src/**/*.ts',
      'test/utils.ts'
    ],
    tests: [
      'test/**/*.ts',
      '!test/utils.ts'
    ],
    env: {
      type: 'node',
      runner: 'node'
    },
    testFramework: 'mocha',

    compilers: {
      '**/*.ts': wallaby.compilers.typeScript({
        outDir: null,
        module: 'commonjs',
        target: 'es5'
      })
    }
  };
};