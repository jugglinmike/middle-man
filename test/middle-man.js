'use strict';
var http = require('http');
var path = require('path');
var Promise = require('bluebird');

var MiddleMan;
var moduleId = '..';

suite('MiddleMan', function() {
  var req, res;

  setup(function() {
    var _end;

    MiddleMan = require(moduleId);

    req = new http.IncomingMessage();
    res = new http.ServerResponse({});

    // Simulate `finish` event
    _end = res.end;
    res.end = function() {
      var result = _end.apply(this, arguments);
      this.emit('finish');
      return result;
    };
  });

  // TODO: Remove this when MiddleMan is no longer a singleton
  teardown(function() {
    delete require.cache[path.resolve(moduleId)];
  });

  suite('#once', function() {

    suite('promise behavior', function() {
      test('resolved when response ends synchronously', function() {
        var count = 0;
        var prms;

        req.method = 'GET';
        req.url = 'http://bocoup.com';

        prms = MiddleMan.once('GET', /.*/, function(req, res) {
          count++;

          res.end();
        });

        return new Promise(function(resolve, reject) {
          prms.then(function() {
            assert.equal(count, 1);
            resolve();
          }, reject);

          MiddleMan.handle(req, res);
        });
      });

      test('resolved when response ends asynchronously', function() {
        var count = 0;
        var prms;

        req.method = 'GET';
        req.url = 'http://bocoup.com';

        prms = MiddleMan.once('GET', /.*/, function(req, res) {
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

          MiddleMan.handle(req, res);
        });
      });

      test('rejected when an error is thrown', function() {
        var err = new Error();
        var prms;

        req.method = 'GET';
        req.url = 'http://bocoup.com';

        prms = MiddleMan.once('GET', /.*/, function() {
          throw err;
        });

        return new Promise(function(resolve, reject) {
          prms.then(function() {
            reject(new Error('Expected promise to be rejected.'));
          }, function(e) {
            assert.equal(e, err);
            resolve();
          });

          MiddleMan.handle(req, res);
        });
      });
    });

    test('ignores method name character case', function() {
      req.method = 'GET';
      req.url = 'http://bocoup.com';

      return new Promise(function(resolve) {
        MiddleMan.once('gEt', /.*/, function(req, res) {
          res.end();
          resolve();
        });

        MiddleMan.handle(req, res);
      });
    });

    test('Only invokes handlers bound via `once` one time', function() {
      var count = 0;
      req.method = 'GET';
      req.url = 'http://bocoup.com';

      MiddleMan.once('GET', /.*/, function(req, res) {
        count++;

        res.end();
      });

      return new Promise(function(resolve) {
        MiddleMan.once('GET', /.*/, function(req, res) {
          assert.equal(count, 1);
          res.end();
          resolve();
        });

        MiddleMan.handle(req, res);
        MiddleMan.handle(req, res);
      });
    });

    suite('`next` behavior', function() {
      var firstCount, secondCount;

      setup(function() {
        firstCount = 0;
        secondCount = 0;
        req.method = 'GET';
        req.url = 'http://bocoup.com';
      });

      test('synchronous', function() {
        MiddleMan.once('GET', /.*/, function(req, res, next) {
          firstCount++;

          next();
        });

        MiddleMan.once('GET', /.*/, function(req, res) {
          secondCount++;

          res.end();
        });

        return new Promise(function(resolve) {
          MiddleMan.once('GET', /.*/, function(req, res) {
            assert.equal(firstCount, 1);
            assert.equal(secondCount, 1);
            res.end();
            resolve();
          });

          MiddleMan.handle(req, res);
          MiddleMan.handle(req, res);
        });
      });

      test('asynchronous', function() {
        MiddleMan.once('GET', /.*/, function(req, res, next) {
          firstCount++;

          setTimeout(next, 0);
        });

        MiddleMan.once('GET', /.*/, function(req, res) {
          secondCount++;

          res.end();
        });

        return new Promise(function(resolve) {
          MiddleMan.once('GET', /.*/, function(req, res) {
            assert.equal(firstCount, 1);
            assert.equal(secondCount, 1);
            res.end();
            resolve();
          });

          MiddleMan.handle(req, res);
          MiddleMan.handle(req, res);
        });
      });
    });
  });
});
