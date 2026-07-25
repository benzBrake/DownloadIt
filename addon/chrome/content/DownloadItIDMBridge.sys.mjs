import {
  buildIDMLocalResponse,
  hasAddonRequestPrincipal,
  IDM_LOCAL_BODY_LIMIT,
  parseIDMLocalEndpoint,
  parseIDMLocalMessage,
} from "./DownloadItIDMProtocol.sys.mjs";

const { classes: Cc, interfaces: Ci, results: Cr } = Components;
const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;
const {
  clearTimeout,
  setTimeout,
} = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const HTTP_MODIFY_REQUEST_TOPIC = "http-on-modify-request";
const RESPONSE_PATH_PREFIX = "/downloadit-idm/";
const HEADER_LIMIT = 16 * 1024;
const PENDING_LIFETIME_MS = 20_000;
const SUBMISSION_TIMEOUT_MS = 10_000;

function readUploadBytes(channel) {
  const uploadChannel = channel.QueryInterface(Ci.nsIUploadChannel);
  const stream = uploadChannel.uploadStream;
  if (!stream) {
    throw new TypeError("IDM request has no upload stream");
  }
  const seekable = stream.QueryInterface(Ci.nsISeekableStream);
  const originalOffset = seekable.tell();
  try {
    seekable.seek(Ci.nsISeekableStream.NS_SEEK_SET, 0);
    const binary = Cc["@mozilla.org/binaryinputstream;1"]
      .createInstance(Ci.nsIBinaryInputStream);
    binary.setInputStream(stream);
    const available = binary.available();
    if (!available || available > IDM_LOCAL_BODY_LIMIT) {
      throw new TypeError("IDM request body has an invalid size");
    }
    return Uint8Array.from(binary.readByteArray(available));
  } finally {
    seekable.seek(Ci.nsISeekableStream.NS_SEEK_SET, originalOffset);
  }
}

function findHeaderEnd(bytes) {
  for (let index = 1; index < bytes.length; index++) {
    if (bytes[index - 1] === 0x0a && bytes[index] === 0x0a) {
      return index + 1;
    }
    if (
      index >= 3 &&
      bytes[index - 3] === 0x0d &&
      bytes[index - 2] === 0x0a &&
      bytes[index - 1] === 0x0d &&
      bytes[index] === 0x0a
    ) {
      return index + 1;
    }
  }
  return -1;
}

function parseResponseToken(bytes) {
  const headerEnd = findHeaderEnd(bytes);
  if (headerEnd < 0) {
    return null;
  }
  const header = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(0, headerEnd),
  );
  const requestLine = header.split(/\r?\n/, 1)[0];
  const match = /^(?:GET|POST) ([^ ]+) HTTP\/1\.[01]$/.exec(requestLine);
  if (!match) {
    throw new TypeError("Invalid bridge HTTP request line");
  }
  const url = new URL(match[1], "http://127.0.0.1");
  if (url.search || url.hash || !url.pathname.startsWith(RESPONSE_PATH_PREFIX)) {
    throw new TypeError("Invalid bridge HTTP request target");
  }
  const token = url.pathname.slice(RESPONSE_PATH_PREFIX.length);
  if (!/^[a-f0-9]{32}$/.test(token)) {
    throw new TypeError("Invalid bridge response token");
  }
  return token;
}

class BridgeConnection {
  constructor(bridge, transport, onClose) {
    this.bridge = bridge;
    this.transport = transport;
    this.onClose = onClose;
    this.headerBytes = [];
    this.handled = false;
    this.closed = false;
    this.input = transport.openInputStream(0, 0, 0);
    this.pump = Cc["@mozilla.org/network/input-stream-pump;1"]
      .createInstance(Ci.nsIInputStreamPump);
    this.pump.init(this.input, 0, 0, true);
    this.pump.asyncRead(this);
  }

  QueryInterface = ChromeUtils.generateQI([
    Ci.nsIRequestObserver,
    Ci.nsIStreamListener,
  ]);

  onStartRequest() {}

  onDataAvailable(request, inputStream, offset, count) {
    const binary = Cc["@mozilla.org/binaryinputstream;1"]
      .createInstance(Ci.nsIBinaryInputStream);
    binary.setInputStream(inputStream);
    const chunk = binary.readByteArray(count);
    if (this.handled || this.closed) {
      return;
    }
    const remaining = HEADER_LIMIT - this.headerBytes.length;
    this.headerBytes.push(...chunk.slice(0, Math.max(0, remaining)));
    const bytes = Uint8Array.from(this.headerBytes);
    let token;
    try {
      token = parseResponseToken(bytes);
    } catch {
      this.handled = true;
      this.respond(400, "Bad Request", "invalid request");
      return;
    }
    if (token) {
      this.handled = true;
      this.bridge.consume(token).then(result => {
        if (!result) {
          this.respond(404, "Not Found", "not found");
          return;
        }
        this.respond(
          200,
          "OK",
          buildIDMLocalResponse(result.seq, result.succeeded),
        );
      }).catch(error => {
        console.error("DownloadIt: IDM bridge response failed", error);
        this.respond(500, "Internal Server Error", "bridge failure");
      });
      return;
    }
    if (this.headerBytes.length >= HEADER_LIMIT) {
      this.handled = true;
      this.respond(431, "Request Header Fields Too Large", "headers too large");
    }
  }

  onStopRequest() {
    if (this.closed) {
      return;
    }
    if (!this.handled && !this.closed) {
      this.handled = true;
      this.respond(400, "Bad Request", "incomplete request");
    }
    this.close(false);
  }

  respond(status, reason, body) {
    if (this.closed) {
      return;
    }
    const response = [
      `HTTP/1.1 ${status} ${reason}`,
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${new TextEncoder().encode(body).length}`,
      "Cache-Control: no-store",
      "Connection: close",
      "",
      body,
    ].join("\r\n");
    try {
      const output = this.transport.openOutputStream(
        Ci.nsITransport.OPEN_BLOCKING,
        0,
        0,
      );
      try {
        let offset = 0;
        while (offset < response.length) {
          const written = output.write(
            response.slice(offset),
            response.length - offset,
          );
          if (!Number.isInteger(written) || written <= 0) {
            throw new Error("IDM bridge response write made no progress");
          }
          offset += written;
        }
        output.flush();
      } finally {
        output.close();
      }
    } catch (error) {
      console.error("DownloadIt: IDM bridge socket response failed", error);
      this.close();
    }
    // onStopRequest closes the input after any remaining POST bytes are drained.
  }

  close(abort = true) {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.input.close();
    } catch {}
    if (abort) {
      try {
        this.transport.close(Cr.NS_BINDING_ABORTED);
      } catch {}
    }
    this.onClose(this);
  }
}

export class DownloadItIDMBridge {
  constructor(service) {
    this.service = service;
    this.server = null;
    this.port = -1;
    this.pending = new Map();
    this.connections = new Set();
    this.running = false;
  }

  QueryInterface = ChromeUtils.generateQI([
    Ci.nsIObserver,
    Ci.nsIServerSocketListener,
  ]);

  start() {
    if (this.running) {
      return;
    }
    const server = Cc["@mozilla.org/network/server-socket;1"]
      .createInstance(Ci.nsIServerSocket);
    const flags = Ci.nsIServerSocket.LoopbackOnly |
      Ci.nsIServerSocket.KeepWhenOffline;
    server.initSpecialConnection(-1, flags, -1);
    try {
      server.asyncListen(this);
      Services.obs.addObserver(this, HTTP_MODIFY_REQUEST_TOPIC);
    } catch (error) {
      try {
        server.close();
      } catch {}
      throw error;
    }
    this.server = server;
    this.port = server.port;
    this.running = true;
  }

  stop() {
    if (!this.running) {
      return;
    }
    this.running = false;
    try {
      Services.obs.removeObserver(this, HTTP_MODIFY_REQUEST_TOPIC);
    } catch {}
    try {
      this.server?.close();
    } catch {}
    this.server = null;
    this.port = -1;
    for (const connection of [...this.connections]) {
      connection.close();
    }
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  observe(subject, topic) {
    if (!this.running || topic !== HTTP_MODIFY_REQUEST_TOPIC) {
      return;
    }
    let channel;
    let endpoint;
    try {
      channel = subject.QueryInterface(Ci.nsIHttpChannel);
      endpoint = parseIDMLocalEndpoint(
        channel.URI.spec,
        channel.requestMethod,
      );
    } catch {
      return;
    }
    if (!endpoint || !hasAddonRequestPrincipal(channel.loadInfo)) {
      return;
    }

    let task;
    try {
      task = parseIDMLocalMessage(readUploadBytes(channel), endpoint.seq);
    } catch {
      return;
    }

    const token = Services.uuid.generateUUID().toString().replace(/[{}-]/g, "");
    const timer = setTimeout(() => {
      this.pending.delete(token);
    }, PENDING_LIFETIME_MS);
    this.pending.set(token, { task, timer });
    try {
      channel.redirectTo(Services.io.newURI(
        `http://127.0.0.1:${this.port}${RESPONSE_PATH_PREFIX}${token}`,
      ));
    } catch {
      clearTimeout(timer);
      this.pending.delete(token);
    }
  }

  onSocketAccepted(server, transport) {
    if (!this.running) {
      try {
        transport.close(Cr.NS_BINDING_ABORTED);
      } catch {}
      return;
    }
    let connection;
    try {
      connection = new BridgeConnection(
        this,
        transport,
        closed => this.connections.delete(closed),
      );
      this.connections.add(connection);
    } catch (error) {
      console.error("DownloadIt: IDM bridge socket setup failed", error);
      connection?.close();
      try {
        transport.close(Cr.NS_BINDING_ABORTED);
      } catch {}
    }
  }

  onStopListening(server, status) {
    if (this.running && status !== Cr.NS_BINDING_ABORTED) {
      console.error(`DownloadIt: IDM bridge listener stopped with ${status}`);
    }
  }

  async consume(token) {
    const entry = this.pending.get(token);
    if (!entry) {
      return null;
    }
    this.pending.delete(token);
    clearTimeout(entry.timer);

    let timeout;
    const timeoutPromise = new Promise(resolve => {
      timeout = setTimeout(() => resolve(false), SUBMISSION_TIMEOUT_MS);
    });
    const submission = Promise.resolve()
      .then(() => this.service.downloadIDMTask(entry.task))
      .then(
        () => true,
        error => {
          console.error("DownloadIt: IDM bridge submission failed", error);
          return false;
        },
      );
    const succeeded = await Promise.race([submission, timeoutPromise]);
    clearTimeout(timeout);
    return {
      seq: entry.task.seq,
      succeeded,
    };
  }
}
