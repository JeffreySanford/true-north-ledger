const target = 'http://localhost:3000';

function isExpectedWebSocketTeardown(error) {
  return error?.code === 'ECONNABORTED' || error?.message?.includes('ECONNABORTED');
}

function configureWebSocketProxy(proxy) {
  proxy.removeAllListeners('error');
  proxy.on('error', (error) => {
    if (isExpectedWebSocketTeardown(error)) {
      return;
    }

    console.error('[ledger-web proxy] websocket proxy error:', error);
  });
}

module.exports = {
  '/api': {
    target,
    secure: false,
  },
  '/socket.io': {
    target,
    secure: false,
    ws: true,
    configure: configureWebSocketProxy,
  },
};
