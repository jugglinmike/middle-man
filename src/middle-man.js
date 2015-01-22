'use strict';
var http = require('http');
var url = require('url');
var httpProxy = require('http-proxy');

var pathToRegExp = require('path-to-regexp');
var Promise = require('bluebird');

function MiddleMan() {
  this._server = http.createServer(this._onRequest.bind(this));
  this._proxyServer = httpProxy.createProxyServer({});
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

MiddleMan.prototype._onRequest = function(req, res) {
  this._handle(req, res)
    .then(function() {
        this._proxy(req, res);
      }.bind(this), function() {});
};

MiddleMan.prototype._proxy = function(req, res) {
  var parts = url.parse(req.url);

  delete parts.path;
  delete parts.pathname;
  delete parts.search;
  delete parts.query;

  // TODO: Remove this when underlying issue is resolved in http-proxy module
  // https://github.com/nodejitsu/node-http-proxy/pull/742
  if (req.method === 'OPTIONS' && !req.headers['content-length']) {
    req.headers['content-length'] = '0';
  }

  process.nextTick(function() {
    this._proxyServer.web(req, res, { target: url.format(parts) });
  }.bind(this));
};

MiddleMan.prototype._handle = function(req, res) {
  var handlers = this._handlers;
  var parts = url.parse(req.url, true);
  req.host = parts.host;
  req.hostname = parts.hostname;
  req.pathname = parts.pathname;
  req.port = parts.port;
  req.protocol = parts.protocol;
  req.query = parts.query;

  return this._handlers.filter(function(handler) {
      return handler.method === req.method &&
        handler.pattern.test(req.pathname);
    }).reduce(function(prev, handler) {
      return prev.then(function() {
          var index = handlers.indexOf(handler);
          var stopChain, continueChain, chainPromise, match;

          // The list of candidate handlers is created sychronously at
          // triggering time but each handler in the list is considered for
          // invocation asynchronously. This means that by the time a given
          // handler is actually considered for invocation, it may have been
          // removed by another request. This is honestly the most clear way I
          // can think to describe it. Don't worry; there are tests for this.
          if (index === -1) {
            return;
          }

          chainPromise = new Promise(function(resolve, reject) {
            continueChain = resolve;
            stopChain = reject;
          });

          res.on('finish', function() {
            handler.resolve();
            stopChain();
          });

          if (handler.once) {
            handlers.splice(index, 1);
          }

          match = handler.pattern.exec(req.pathname);

          req.params = {};
          handler.keys.forEach(function(key, idx) {
            req.params[key.name] = match[idx + 1];
          });

          try {
            handler.handler.call(null, req, res, continueChain);
          } catch (err) {
            handler.reject(err);
            stopChain();
          }

          return chainPromise;
        });
    }, Promise.resolve());
};

MiddleMan.prototype._bind = function(options) {
  var uppercaseMethod = options.method.toUpperCase();
  var keys = [];
  var handler;

  handler = {
    once: options.once,
    method: uppercaseMethod,
    pattern: pathToRegExp(options.route, keys),
    keys: keys,
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

MiddleMan.prototype.off = function() {
  this._handlers.length = 0;
};
