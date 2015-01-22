'use strict';
var http = require('http');
var Promise = require('bluebird');

var MiddleMan = require('..');
var middleManPort = process.env.NODE_PORT || 8033;
var targetPort = 4083;

suite('MiddleMan', function() {
  var middleMan, targetServer;

  function request(method, path) {
    var req = http.request({
      port: middleManPort,
      host: 'localhost',
      method: method,
      path: 'http://localhost:' + targetPort + path
    });

    return new Promise(function(resolve, reject) {
      req.on('error', reject);
      req.on('response', function(res) {
        res.on('data', function() {});
        res.on('end', resolve);
      });
      req.end();
    });
  }

  suiteSetup(function(done) {
    targetServer = http.createServer(function(req, res) { res.end(); });
    targetServer.listen(targetPort, done);
  });

  suiteTeardown(function(done) {
    targetServer.close(done);
  });

  setup(function() {
    middleMan = new MiddleMan();

    return middleMan.listen(middleManPort);
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

    suite('url parsing', function() {
      test('url parts', function() {
        return new Promise(function(resolve) {
            middleMan.once('GET', /.*/, function(req, res) {
              assert.equal(req.host, 'localhost:' + targetPort);
              assert.equal(req.hostname, 'localhost');
              assert.equal(req.pathname, '/some-path');
              assert.equal(req.port, targetPort);
              assert.equal(req.protocol, 'http:');
              assert.deepEqual(req.query, { attr1: '23', attr2: '45' });
              res.end();
              resolve();
            });

            request('GET', '/some-path?attr2=45&attr1=23');
          });
      });

      test('path splats', function(done) {
        middleMan.once('GET', '/something/:id', function(req, res) {
          assert.equal(req.params.id, '45');
          res.end();
          done();
        });

        request('GET', '/something/45');
      });

      test('handler isolation', function(done) {
        var firstCalled = false;
        middleMan.once('GET', '/:foo/:bar', function(req, res, next) {
          firstCalled = true;

          assert.deepEqual(req.params, { foo: 'michael', bar: 'jordan' });
          next();
        });

        middleMan.once('GET', '/:bar/:baz', function(req, res) {
          assert.ok(firstCalled);
          assert.deepEqual(req.params, { bar: 'michael', baz: 'jordan' });

          res.end();
          done();
        });

        request('GET', '/michael/jordan');
      });
    });

    test('passes through requests with no matching handler', function() {
      var targetReceived = 0;

      targetServer.on('request', function() {
        targetReceived++;
      });

      return request('GET', '/').then(function() {
          assert.equal(targetReceived, 1);
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

  suite('#off', function() {
    test('removes all listeners', function(done) {
      var count = 0;
      middleMan.once('GET', /.*/, function(req, res) {
        count++;
        res.end();
      });
      middleMan.once('GET', /.*/, function(req, res) {
        count++;
        res.end();
      });

      middleMan.off();

      middleMan.once('GET', /.*/, function(req, res) {
        count++;
        res.end();
        assert.equal(count, 1);
        done();
      });

      request('GET', '/');
    });
  });

});
