'use strict';
var http = require('http');
var url = require('url');

var pathToRegExp = require('path-to-regexp');
var Promise = require('bluebird');

function MiddleMan() {
  this._server = http.createServer(this._handle.bind(this));
  this._handlers = [];
}

module.exports = MiddleMan;

MiddleMan.prototype.listen = function(port, host) {
  var server = this._server;

  host = host || '127.0.0.1';

  return new Promise(function(resolve, reject) {
    server.listen(port, host, function(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

MiddleMan.prototype.close = function() {
  var server = this._server;
  return new Promise(server.close.bind(server));
};

MiddleMan.prototype._handle = function(req, res) {
  var pathName = url.parse(req.url).pathname;
  var handlers = this._handlers;

  this._handlers.filter(function(handler) {
    return handler.method === req.method && handler.pattern.test(pathName);
  }).reduce(function(prev, handler) {

    return prev.then(function() {
        var index = handlers.indexOf(handler);
        var stopChain, continueChain, chainPromise;

        // The list of candidate handlers is created sychronously at triggering
        // time but each handler in the list is considered for invocation
        // asynchronously. This means that by the time a given handler is
        // actually considered for invocation, it may have been removed by
        // another request. This is honestly the most clear way I can think to
        // describe it. Don't worry; there are tests for this.
        if (index === -1) {
          return;
        }

        chainPromise = new Promise(function(resolve, reject) {
          stopChain = resolve;
          continueChain = reject;
        });

        res.on('finish', function() {
          handler.resolve();
          stopChain();
        });

        if (handler.once) {
          handlers.splice(index, 1);
        }

        try {
          handler.handler.call(null, req, res, continueChain);
        } catch (err) {
          handler.reject(err);
          stopChain();
        }

        return chainPromise;
      });
  }, Promise.resolve()).then(null, function() {});

  // TODO: Do something with unhandled request/response pairs (which can be
  //       recognized when the above promise reduction is resolved
  //       successfully).
};

MiddleMan.prototype._bind = function(options) {
  var uppercaseMethod = options.method.toUpperCase();
  var handler;

  handler = {
    once: options.once,
    method: uppercaseMethod,
    pattern: pathToRegExp(options.route),
    handler: options.handler
  };

  this._handlers.push(handler);

  handler.promise = new Promise(function(resolve, reject) {
    handler.resolve = resolve;
    handler.reject = reject;
  });

  return handler.promise;
};

MiddleMan.prototype.on = function(method, route, handler) {
  this._bind({
    method: method,
    route: route,
    handler: handler
  });
};

MiddleMan.prototype.once = function(method, route, handler) {
  return this._bind({
    once: true,
    method: method,
    route: route,
    handler: handler
  });
};
