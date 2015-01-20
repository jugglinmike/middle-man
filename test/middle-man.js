'use strict';
var http = require('http');
var Promise = require('bluebird');

var MiddleMan = require('..');
var port = process.env.NODE_PORT || 8033;

suite('MiddleMan', function() {
  var middleMan;

  function request(method, path) {
    var req = http.request({
      port: port,
      path: path,
      method: method
    });

    req.end();
  }

  setup(function() {
    middleMan = new MiddleMan();

    return middleMan.listen(port);
  });

  teardown(function() {
    middleMan.close();
  });

  suite('#once', function() {

    suite('promise behavior', function() {
      test('resolved when response ends synchronously', function() {
        var count = 0;
        var prms;

        prms = middleMan.once('GET', /.*/, function(req, res) {
          count++;

          res.end();
        });

        return new Promise(function(resolve, reject) {
          prms.then(function() {
            assert.equal(count, 1);
            resolve();
          }, reject);

          request('GET', '/');
        });
      });

      test('resolved when response ends asynchronously', function() {
        var count = 0;
        var prms;

        prms = middleMan.once('GET', /.*/, function(req, res) {
          count++;

          setTimeout(function() {
            count++;
            res.end();
          }, 0);
        });

        return new Promise(function(resolve, reject) {
          prms.then(function() {
            assert.equal(count, 2);
            resolve();
          }, reject);

          request('GET', '/');
        });
      });

      test('rejected when an error is thrown', function() {
        var err = new Error();
        var prms;

        prms = middleMan.once('GET', /.*/, function() {
          throw err;
        });

        return new Promise(function(resolve, reject) {
          prms.then(function() {
            reject(new Error('Expected promise to be rejected.'));
          }, function(e) {
            assert.equal(e, err);
            resolve();
          });

          request('GET', '/');
        });
      });
    });

    test('ignores method name character case', function() {
      return new Promise(function(resolve) {
        middleMan.once('gEt', /.*/, function(req, res) {
          res.end();
          resolve();
        });

        request('GET', '/');
      });
    });

    test('Only invokes handlers bound via `once` one time', function() {
      var count = 0;

      middleMan.once('GET', /.*/, function(req, res) {
        count++;

        res.end();
      });

      return new Promise(function(resolve) {
        middleMan.once('GET', /.*/, function(req, res) {
          assert.equal(count, 1);
          res.end();
          resolve();
        });

        request('GET', '/');
        request('GET', '/');
      });
    });

    suite('`next` behavior', function() {
      var firstCount, secondCount;

      setup(function() {
        firstCount = 0;
        secondCount = 0;
      });

      test('synchronous', function() {
        middleMan.once('GET', /.*/, function(req, res, next) {
          firstCount++;

          next();
        });

        middleMan.once('GET', /.*/, function(req, res) {
          secondCount++;

          res.end();
        });

        return new Promise(function(resolve) {
          middleMan.once('GET', /.*/, function(req, res) {
            assert.equal(firstCount, 1);
            assert.equal(secondCount, 1);
            res.end();
            resolve();
          });

          request('GET', '/');
          request('GET', '/');
        });
      });

      test('asynchronous', function() {
        middleMan.once('GET', /.*/, function(req, res, next) {
          firstCount++;

          setTimeout(next, 0);
        });

        middleMan.once('GET', /.*/, function(req, res) {
          secondCount++;

          res.end();
        });

        return new Promise(function(resolve) {
          middleMan.once('GET', /.*/, function(req, res) {
            assert.equal(firstCount, 1);
            assert.equal(secondCount, 1);
            res.end();
            resolve();
          });

          request('GET', '/');
          request('GET', '/');
        });
      });
    });
  });
});
