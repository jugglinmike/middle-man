'use strict';
var http = require('http');
var url = require('url');
var httpProxy = require('http-proxy');

var pathToRegExp = require('path-to-regexp');
var Promise = require('bluebird');

/**
 * Create a proxy instance
 *
 * @constructor
 */
function MiddleMan() {
  this._server = http.createServer(this._onRequest.bind(this));
  this._proxyServer = httpProxy.createProxyServer({});
  this._handlers = [];
}

module.exports = MiddleMan;

/**
 * Bind to network traffic on a given address
 *
 * @param {number} port
 * @param {string} [host=127.0.0.1]
 *
 * @returns {Promise}
 */
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

/**
 * Cease listening to network traffic
 *
 * @returns {Promise}
 */
MiddleMan.prototype.close = function() {
  var server = this._server;
  return new Promise(function(resolve, reject) {
      server.close(function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
};

/**
 * @private
 */
MiddleMan.prototype._onRequest = function(req, res) {
  this._handle(req, res)
    .then(function() {
        this._proxy(req, res);
      }.bind(this), function() {});
};

/**
 * @private
 */
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

/**
 * @private
 */
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
      return (handler.method === req.method || handler.method === '*') &&
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
            if (handler.once) {
              handler.resolve();
              delete handler.resolve;
              delete handler.reject;
            }
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
            if (handler.once) {
              handler.reject(err);
              delete handler.resolve;
              delete handler.reject;
            }
            stopChain();
          }

          return chainPromise;
        });
    }, Promise.resolve());
};

/**
 * @private
 */
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

/**
 * Register a function to be invoked in response to every HTTP request that
 * satisfies some criteria.
 *
 * @param {string} method - HTTP method to respond to. The value '*' may be
 *                          used to indicate "all methods"
 * @param {string|RegeExp} route - Pattern describing which URL paths to
 *                                 respond to. Strings may use the keene-star
 *                                 operator, as in:
 *                                     '/dir/.*'
 *                                 and "splats", as in:
 *                                     '/dir/:aName'
 * @param {Function} handler - function to invoke for all matching requests.
 *                             This will be invoked with the Node.js request/
 *                             response pair. The request will be augmented to
 *                             include properties for:
 *                             - URL parts (host, hostname, pathname, port,
 *                               protocol, and query)
 *                             - URL pattern matches on the `params` attribute
 *                               (values that match splats will be defined on
 *                               the object using the splat value as the
 *                               property name; values that match kleene-star
 *                               or regular expression groups will be defined
 *                               using numeric indices)
 *                             Additionally, if the handler specifies a third
 *                             parameter, a "next" function will be provided.
 *                             In this case, no further handlers will be called
 *                             (and the request will *not* be forwarded) until
 *                             the function is invoked.
 */
MiddleMan.prototype.on = function(method, route, handler) {
  this._bind({
    method: method,
    route: route,
    handler: handler
  });
};

/**
 * Register a function to be invoked in response to the next HTTP request that
 * satisfies some criteria. The method signature is identical to MiddleMan#on.
 *
 * @param {string} method - See MiddleMan#on
 * @param {string|RegExp} route - See MiddleMan#on
 * @param {Function} handler - See MiddleMan#on
 *
 * @returns {Promise} resolved when the handler is complete (this is signaled
 *                    by closing the request or by invoking the optional third
 *                    parameter supplied to the handler)
 */
MiddleMan.prototype.once = function(method, route, handler) {
  return this._bind({
    once: true,
    method: method,
    route: route,
    handler: handler
  });
};

/**
 * Remove all handlers or one specific handler.
 *
 * @param {string} [method] request method for which to remove a specific
 *                          handler function
 * @param {Function} [handler] handler function to remove
 */
MiddleMan.prototype.off = function(method, handler) {
  if (arguments.length === 0) {
    this._handlers.length = 0;
    return;
  }

  method = method.toUpperCase();

  this._handlers.some(function(obj, index, handlers) {
    if (obj.method === method && obj.handler === handler) {
      handlers.splice(index, 1);
      return true;
    }
  });
};
