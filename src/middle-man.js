'use strict';
var url = require('url');

var pathToRegExp = require('path-to-regexp');
var Promise = require('bluebird');
var handlers = [];

exports.handle = handle;
function handle(req, res) {
  var pathName = url.parse(req.url).pathname;

  handlers.filter(function(handler) {
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
}

exports._bind = function(options) {
  var uppercaseMethod = options.method.toUpperCase();
  var handler;

  handler = {
    once: options.once,
    method: uppercaseMethod,
    pattern: pathToRegExp(options.route),
    handler: options.handler
  };

  handlers.push(handler);

  handler.promise = new Promise(function(resolve, reject) {
    handler.resolve = resolve;
    handler.reject = reject;
  });

  return handler.promise;
};

exports.on = function(method, route, handler) {
  exports._bind({
    method: method,
    route: route,
    handler: handler
  });
};

exports.once = function(method, route, handler) {
  return exports._bind({
    once: true,
    method: method,
    route: route,
    handler: handler
  });
};
