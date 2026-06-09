// test-via-proxy.js
// Connect to the Bun proxy and run RFB handshake + rapid pointer events.

const PROXY_URL = "ws://localhost:8011/docker-vnc/sift";

const ws = new WebSocket(PROXY_URL, {
  headers: { "Sec-WebSocket-Protocol": "binary" }
});
ws.binaryType = "arraybuffer";

let step = 0;
let pointerCount = 0;
let closed = false;

function send(data, label) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  console.log(`[client] TX ${label} (${buf.length} bytes): ${buf.toString("hex").slice(0, 40)}`);
  ws.send(buf);
}

ws.onopen = () => {
  console.log("[client] WebSocket open, waiting for RFB handshake...");
};

ws.onmessage = (e) => {
  const data = new Uint8Array(e.data);
  const hex = data.slice(0, 8).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  console.log(`[client] RX ${data.length} bytes: ${hex}...`);

  if (step === 0 && hex.startsWith("524642")) {
    console.log("→ RFB version received");
    send(Buffer.from("RFB 003.008\n"), "RFB version reply");
    step = 1;
    return;
  }

  if (step === 1) {
    const numTypes = data[0];
    const types = Array.from(data.slice(1, 1 + numTypes));
    console.log(`→ Security types: ${types}`);
    const chosen = types.includes(1) ? 1 : types[0];
    send(new Uint8Array([chosen]), `Security type ${chosen}`);
    step = (chosen === 1) ? 2 : 10;
    return;
  }

  if (step === 2) {
    console.log("→ Security result OK");
    step = 3;
    send(new Uint8Array([1]), "ClientInit (shared=1)");
    return;
  }

  if (step === 10) {
    step = 11;
    send(new Uint8Array(16).fill(0), "Challenge response");
    return;
  }

  if (step === 11) {
    console.log("→ Auth result OK");
    step = 3;
    send(new Uint8Array([1]), "ClientInit");
    return;
  }

  if (step === 3) {
    console.log("→ ServerInit received");
    step = 4;

    const setPF = Buffer.alloc(20);
    setPF[0] = 0;
    setPF[4] = 32; setPF[5] = 24;
    setPF[6] = 0; setPF[7] = 1;
    setPF[8] = 0; setPF[9] = 255;
    setPF[10] = 0; setPF[11] = 255;
    setPF[12] = 0; setPF[13] = 255;
    setPF[14] = 16; setPF[15] = 8; setPF[16] = 0;
    send(setPF, "SetPixelFormat");

    const enc = Buffer.alloc(12);
    enc[0] = 2;
    enc.writeUInt16BE(1, 2);
    enc.writeInt32BE(0, 4);
    send(enc, "SetEncodings");

    const fbur = Buffer.alloc(10);
    fbur[0] = 3;
    fbur[1] = 0;
    fbur.writeUInt16BE(0, 2);
    fbur.writeUInt16BE(0, 4);
    fbur.writeUInt16BE(800, 6);
    fbur.writeUInt16BE(600, 8);
    send(fbur, "FBUR");

    setTimeout(() => {
      console.log("\n=== Sending 20 rapid pointer events (5ms apart) ===");
      for (let i = 0; i < 20; i++) {
        setTimeout(() => {
          if (closed) return;
          const ptr = Buffer.alloc(6);
          ptr[0] = 5;
          ptr[1] = 1;
          ptr.writeUInt16BE(100 + i * 10, 2);
          ptr.writeUInt16BE(100 + i * 5, 4);
          send(ptr, `PointerEvent #${i}`);
          pointerCount++;
        }, i * 5);
      }
    }, 2000);
    return;
  }

  if (data.length <= 20) {
    console.log(`[client] RX small msg (${data.length} bytes): ${hex}`);
  }
};

ws.onerror = (err) => {
  console.error("[client] ERROR:", err.message);
};

ws.onclose = (ev) => {
  closed = true;
  console.log(`\n[client] CLOSED code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} total pointers sent=${pointerCount}`);
  if (pointerCount === 20 && ev.code !== 1006) {
    console.log("✅ SUCCESS: All pointer events sent, connection stayed open!");
  } else {
    console.log("❌ FAIL: Premature close or incomplete pointer events.");
  }
  process.exit(0);
};

setTimeout(() => {
  if (!closed) {
    console.log("\n⏱️ Timeout: connection still open after 10s – success!");
    ws.close();
  }
}, 15000);