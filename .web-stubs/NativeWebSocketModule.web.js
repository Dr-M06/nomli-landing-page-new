/**
 * Web stub for RN's NativeWebSocketModule (TurboModuleRegistry.getEnforcing('WebSocketModule')).
 * Bridges RN's WebSocket.js to the browser WebSocket API via RCTDeviceEventEmitter.
 */
'use strict';

const base64 = require('base64-js');
const RCTDeviceEventEmitter = require('../node_modules/react-native/Libraries/EventEmitter/RCTDeviceEventEmitter')
  .default;

const sockets = new Map();

/** WebSocket.OPEN === 1; avoid referencing `WebSocket` in send paths if missing. */
const WS_OPEN = 1;

function emit(eventType, payload) {
  RCTDeviceEventEmitter.emit(eventType, payload);
}

const NativeWebSocketModule = {
  connect(url, protocols, _options, socketID) {
    if (typeof WebSocket === 'undefined') {
      emit('websocketFailed', {
        id: socketID,
        message: 'WebSocket is not available in this environment',
      });
      return;
    }
    let ws;
    try {
      ws = new WebSocket(url, protocols || undefined);
    } catch (e) {
      emit('websocketFailed', {
        id: socketID,
        message: e && e.message ? e.message : 'WebSocket connect failed',
      });
      return;
    }

    sockets.set(socketID, ws);

    let failedNotified = false;

    ws.onopen = () => {
      emit('websocketOpen', { id: socketID, protocol: ws.protocol || '' });
    };

    ws.onerror = () => {
      failedNotified = true;
      emit('websocketFailed', {
        id: socketID,
        message: 'WebSocket error',
      });
    };

    ws.onmessage = (event) => {
      const { data } = event;
      if (typeof data === 'string') {
        emit('websocketMessage', { type: 'text', id: socketID, data });
        return;
      }
      if (data instanceof ArrayBuffer) {
        emit('websocketMessage', {
          type: 'binary',
          id: socketID,
          data: base64.fromByteArray(new Uint8Array(data)),
        });
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        data.arrayBuffer().then((buf) => {
          emit('websocketMessage', {
            type: 'binary',
            id: socketID,
            data: base64.fromByteArray(new Uint8Array(buf)),
          });
        });
      }
    };

    ws.onclose = (event) => {
      sockets.delete(socketID);
      if (failedNotified) {
        return;
      }
      emit('websocketClosed', {
        id: socketID,
        code: event.code,
        reason: event.reason || '',
      });
    };
  },

  send(message, forSocketID) {
    const ws = sockets.get(forSocketID);
    if (ws && ws.readyState === WS_OPEN) {
      ws.send(message);
    }
  },

  sendBinary(base64String, forSocketID) {
    const ws = sockets.get(forSocketID);
    if (ws && ws.readyState === WS_OPEN) {
      const bytes = base64.toByteArray(base64String);
      ws.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  },

  ping(_socketID) {},

  close(code, reason, socketID) {
    const ws = sockets.get(socketID);
    if (ws) {
      sockets.delete(socketID);
      try {
        ws.close(code, reason);
      } catch (_) {
        /* ignore */
      }
    }
  },

  addListener(_eventName) {},

  removeListeners(_count) {},
};

module.exports = NativeWebSocketModule;
module.exports.default = NativeWebSocketModule;
