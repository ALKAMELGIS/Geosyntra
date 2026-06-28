/**
 * Block Mapbox GL telemetry before mapbox-gl.js loads.
 * events.mapbox.com / map-sessions POSTs bypass transformRequest and fail CORS on localhost.
 */
(function () {
  'use strict';

  var STUB_JSON = '{}';

  function isBlockedMapboxUrl(url) {
    try {
      var s = String(url || '');
      if (/events\.mapbox\.com/i.test(s)) return true;
      if (/\/map-sessions/i.test(s) && /mapbox/i.test(s)) return true;
    } catch (_) {
      //
    }
    return false;
  }

  function stubFetchResponse() {
    return new Response(STUB_JSON, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function fireXhrComplete(xhr) {
    try {
      Object.defineProperty(xhr, 'readyState', {
        configurable: true,
        get: function () {
          return 4;
        },
      });
      Object.defineProperty(xhr, 'status', {
        configurable: true,
        get: function () {
          return 200;
        },
      });
      Object.defineProperty(xhr, 'statusText', {
        configurable: true,
        get: function () {
          return 'OK';
        },
      });
      Object.defineProperty(xhr, 'response', {
        configurable: true,
        get: function () {
          return STUB_JSON;
        },
      });
      Object.defineProperty(xhr, 'responseText', {
        configurable: true,
        get: function () {
          return STUB_JSON;
        },
      });
      xhr.dispatchEvent(new Event('readystatechange'));
      xhr.dispatchEvent(new Event('load'));
      xhr.dispatchEvent(new Event('loadend'));
    } catch (_) {
      //
    }
  }

  if (typeof window.fetch === 'function') {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      var url =
        typeof input === 'string'
          ? input
          : input && typeof input === 'object' && input.url
            ? input.url
            : '';
      if (isBlockedMapboxUrl(url)) {
        return Promise.resolve(stubFetchResponse());
      }
      return nativeFetch.apply(this, arguments);
    };
  }

  var NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    window.XMLHttpRequest = function () {
      var xhr = new NativeXHR();
      var blocked = false;
      var open = xhr.open;
      xhr.open = function (method, url) {
        blocked = isBlockedMapboxUrl(url);
        return open.apply(xhr, arguments);
      };
      var send = xhr.send;
      xhr.send = function (body) {
        if (blocked) {
          setTimeout(function () {
            fireXhrComplete(xhr);
          }, 0);
          return;
        }
        return send.apply(xhr, arguments);
      };
      return xhr;
    };
    window.XMLHttpRequest.prototype = NativeXHR.prototype;
  }
})();
