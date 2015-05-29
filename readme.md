# MiddeMan

A scriptable HTTP proxy, designed for use in UI tests for web applications.

[![Build Status](https://travis-ci.org/jugglinmike/middle-man.svg?branch=master)](https://travis-ci.org/jugglinmike/middle-man)

Rich web applications often interact with external services by making HTTP
requests. Testing applications like this can be difficult for a number of
reasons:

- **Servers may be unavailable** due to service outages, maintenance, or
  local unavailability of network connection
- **Responses may be slow**, further increasing the time required to execute UI
  tests
- **Requests may be throttled**. This introduces artificial limits on the
  application's test schedule
- **Requests may have side effects**, so automated tests may exhibit different
  behavior during repeated execution
- **Secure operations may require sensitive credentials**, necessitating the
  creation of shared "dummy" accounts and management of shared, semi-private
  credentials

MiddleMan is a tool intended to be used as an intermediary between UI tests for
web applications and the external services with which they interact. Through a
simple, [Express](http://expressjs.com/)-inspired API, test writers can control
exactly how web requests are handled in the context of the current-running UI
tests.

## Usage

**Initialization** This tool is intended for use in
[Selenium](http://seleniumhq.org/)-powered UI tests, but it is completely
agnostic of test framework and Selenium binding.

```js
var createSeleniumBinding = require('your-favorite-selenium-binding');
var startTests = require('your-favorite-testing-framework');

var MiddleMan = require('middle-man');
var middleMan = new MiddleMan();
var mmPort = 8003;

middleMan.listen(mmPort)
  .then(function() {
    return createSeleniumBinding({
      server: 'http://localhost:4444/wd/hub',
      capabilities = {
        browserName: 'firefox',
        proxy: {
          proxyType: 'manual',
          httpProxy: 'localhost:' + mmPort
        }
      }
    });
  }).then(function() {
    startTests();
  });
```

**Generic request handlers** In some cases, you may want to unilaterally
react to certain types of requests. The `on` method allows you to register
code to modify every request/response pairs that match some criteria:

```js
/**
 * Set the CORS flag to ensure that requests are not subject to any same-origin
 * policy for the duration of the tests.
 */
function handleCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // If your handler specifies a third parameter, it will be provided with a
  // function that *must* be invoked before the request is passed through.
  next();
}

// Bind to all HTTP verbs and all URL paths
middleMan.on('*', /.*/, handleCors);
```

In some cases, you may be able to handle the HTTP request yourself (instead of
allowing it to "pass through"). The second parameter is [a Node.js response
object](https://nodejs.org/api/http.html#http_class_http_serverresponse), and
when it is closed, the proxy will not issue it to the web (nor invoke any
additional request handlers).

```js
function handleCorsPreflight(req, res) {
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, authorization, content-type'
  );
  res.setHeader(
    'Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE'
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Origin');

  // No need for the `next` parameter here--we don't need the request to pass
  // through.
  res.end('');
}

// Bind to OPTIONS requests for all URL paths
middleMan.on('OPTIONS', /.*/, handleCorsPreflight);
```

**Scripting specific responses** In the course of a UI test, your script
probably causes the application to issue web requests. This tool allows you to
programatically control the response behavior:

```js
test('awesome test', function() {
  var hasDeleted = false;
  function handleDelete(req, res) {
    hasDeleted = true;
    res.end();
  }
  function handlePost(req, res) {
    assert(hasDeleted, 'Deletes old utilization before creating new one.');
    res.end(JSON.stringify({ utilizations: { id: 99 } }));
  }

  // This pattern allows you to verify that the requests are actually made--
  // the test will time out if the Promises returned by `MiddleMan#once` are
  // not resolved.
  Promise.all([
      middleMan.once('DELETE', '/v1/utilizations/99', handleDelete),
      middleMan.once('POST', '/v1/utilizations', handlePost),
      driver.editUtilization({
        name: 'Jerry Seinfeld',
        day: 'thursday',
        type: 'Vacation'
      })
    ]).then(function() {
      testDone();
    });
});
```

## API Documentation

The API is defined within the source code itself using
[JSDoc](http://usejsdoc.org/) formatting.

## License

Copyright (c) 2015 Mike Pennisi  
Licensed under the MIT Expat license.
