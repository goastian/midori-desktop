/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function test_json_upload_and_query() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/api/v1/pair/redeem", (request, response) => {
      Assert.equal(request.method, "POST");
      Assert.equal(request.getHeader("Authorization"), "Bearer fictitious-token");
      Assert.equal(request.queryString, "name=a%26b");
      const input = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      input.init(request.bodyInputStream);
      Assert.equal(input.readBytes(input.available()), '{"value":"test"}');
      respondJSON(response, { paired: true }, 201);
    });
    const result = await transport.request("api/v1/pair/redeem", {
      method: "POST", token: "fictitious-token", body: { value: "test" }, query: { name: "a&b" },
    });
    Assert.deepEqual(result, { status: 201, data: { paired: true } });
  });
});



add_task(async function test_loopback_ignores_configured_proxy() {
  const proxy = new HttpServer();
  proxy.start(-1);
  let proxyHits = 0;
  proxy.registerPrefixHandler("/", (_request, response) => {
    proxyHits++;
    respondJSON(response, { proxy: true });
  });
  const prefs = ["network.proxy.type", "network.proxy.http", "network.proxy.http_port", "network.proxy.no_proxies_on", "network.proxy.allow_hijacking_localhost"];
  try {
    Services.prefs.setIntPref(prefs[0], 1);
    Services.prefs.setStringPref(prefs[1], "127.0.0.1");
    Services.prefs.setIntPref(prefs[2], proxy.identity.primaryPort);
    Services.prefs.setStringPref(prefs[3], "");
    Services.prefs.setBoolPref(prefs[4], true);
    await withSyncServer(async (server, transport) => {
      server.registerPathHandler("/direct", (_request, response) => respondJSON(response, { direct: true }));
      Assert.deepEqual((await transport.request("direct")).data, { direct: true });
      Assert.equal(proxyHits, 0, "The local session never reaches the configured proxy");
    });
  } finally {
    for (const pref of prefs) {
      Services.prefs.clearUserPref(pref);
    }
    await new Promise(resolve => proxy.stop(resolve));
  }
});

add_task(async function test_cookies_are_not_reused() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/cookies", (request, response) => {
      Assert.ok(!request.hasHeader("Cookie"));
      Assert.ok(!request.hasHeader("Referer"));
      response.setHeader("Set-Cookie", "session=fictitious; Path=/", false);
      respondJSON(response, {});
    });
    await transport.request("cookies");
    await transport.request("cookies");
  });
});

add_task(async function test_redirect_cannot_forward_session() {
  await withSyncServer(async (server, transport) => {
    let targetHits = 0;
    server.registerPathHandler("/redirect", (_request, response) => {
      response.setStatusLine("1.1", 307, "Temporary redirect");
      response.setHeader("Location", `http://127.0.0.1:${server.identity.primaryPort}/target`, false);
    });
    server.registerPathHandler("/target", (_request, response) => {
      targetHits++;
      respondJSON(response, {});
    });
    await Assert.rejects(transport.request("redirect", { token: "fictitious-token" }), /redirect_rejected/);
    Assert.equal(targetHits, 0);
  });
});

add_task(async function test_streaming_response_limit() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/large", (_request, response) => {
      response.processAsync();
      response.setHeader("Content-Type", "application/json", false);
      response.write(JSON.stringify({ value: "x".repeat(512) }));
      response.finish();
    });
    await Assert.rejects(transport.request("large", { maxBytes: 128 }), /response_too_large/);
  });
});

add_task(async function test_invalid_content_and_server_errors() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/html", (_request, response) => {
      response.setHeader("Content-Type", "text/html", false);
      response.write("<html>Login</html>");
    });
    server.registerPathHandler("/invalid", (_request, response) => {
      response.setHeader("Content-Type", "application/json", false);
      response.write("{broken");
    });
    server.registerPathHandler("/limited", (_request, response) => {
      response.setHeader("Retry-After", "35", false);
      respondJSON(response, { error: "untrusted error content" }, 429);
    });
    await Assert.rejects(transport.request("html"), /invalid_response/);
    await Assert.rejects(transport.request("invalid"), /invalid_response/);
    await Assert.rejects(transport.request("limited"), error =>
      error.code === "rate_limited" && error.status === 429 && error.retryAfter === 35);
  });
});

add_task(async function test_timeout_and_cancellation() {
  await withSyncServer(async (server, transport) => {
    const responses = [];
    server.registerPathHandler("/wait", (_request, response) => {
      response.processAsync();
      responses.push(response);
    });
    try {
      await Assert.rejects(transport.request("wait", { timeout: 50 }), /timeout/);
      const controller = new AbortController();
      const pending = transport.request("wait", { signal: controller.signal });
      controller.abort();
      await Assert.rejects(pending, /cancelled/);
      await Assert.rejects(transport.request("wait", { signal: controller.signal }), /cancelled/);
      const closing = transport.request("wait");
      transport.close();
      await Assert.rejects(closing, /cancelled/);
      await Assert.rejects(transport.request("wait"), /cancelled/);
    } finally {
      for (const response of responses) {
        response.finish();
      }
    }
  });
});

add_task(async function test_invalid_requests_do_not_connect() {
  await withSyncServer(async (server, transport) => {
    let hits = 0;
    server.registerPrefixHandler("/", (_request, response) => {
      hits++;
      respondJSON(response, {});
    });
    for (const path of ["//example.org/", "https://example.org/", "../escape", "/outside", "api/%2e%2e/test", "api?token=x"]) {
      await Assert.rejects(transport.request(path), /invalid_request/);
    }
    await Assert.rejects(transport.request("api", { token: "x\r\nCookie: x" }), /invalid_request/);
    await Assert.rejects(transport.request("api", { method: "POST", body: "x".repeat(4 * 1024 * 1024) }), /request_too_large/);
    Assert.equal(hits, 0);
  });
});



add_task(async function test_protocol_errors_expose_only_known_codes() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/conflict", (_request, response) => {
      respondJSON(response, { error: "crypto_state_conflict", detail: "private server content" }, 409);
    });
    server.registerPathHandler("/untrusted", (_request, response) => {
      respondJSON(response, { error: "private server content" }, 409);
    });
    server.registerPathHandler("/unauthorized", (_request, response) => {
      respondJSON(response, { error: "crypto_state_conflict" }, 401);
    });
    server.registerPathHandler("/cursor", (_request, response) => {
      respondJSON(response, { error: "invalid_cursor" }, 400);
    });
    server.registerPathHandler("/reset", (_request, response) => {
      respondJSON(response, { error: "reset_required" }, 409);
    });
    await Assert.rejects(transport.request("conflict"), error => error.code === "crypto_state_conflict" && error.status === 409 && !error.message.includes("private"));
    await Assert.rejects(transport.request("untrusted"), /http_error/);
    await Assert.rejects(transport.request("unauthorized"), /auth_required/);
    await Assert.rejects(transport.request("cursor"), /invalid_cursor/);
    await Assert.rejects(transport.request("reset"), /reset_required/);
  });
});

add_task(async function test_notification_stream_uses_one_use_ticket_and_only_changed_events() {
  await withSyncServer(async (server, transport) => {
    let changes = 0;
    server.registerPathHandler("/api/v1/sync/notifications/stream", (request, response) => {
      Assert.equal(request.method, "GET");
      Assert.equal(request.queryString, "");
      Assert.equal(request.getHeader("Authorization"), `MidoriNotification ${"a".repeat(64)}`);
      Assert.ok(!request.hasHeader("Cookie"));
      response.processAsync();
      response.setHeader("Content-Type", "text/event-stream", false);
      response.write(": connected\n\n");
      response.write("event: changed\ndata: {}\n\n");
      response.write("event: ignored\ndata: {}\n\n");
      response.finish();
    });
    await transport.watchNotifications("a".repeat(64), { onChange: () => { changes++; } });
    Assert.equal(changes, 1);
    Assert.throws(() => transport.watchNotifications("bad", { onChange: () => {} }), /invalid_request/);
  });
});

add_task(async function test_unavailable_notification_stream_reports_unsupported_status() {
  await withSyncServer(async (server, transport) => {
    server.registerPathHandler("/api/v1/sync/notifications/stream", (_request, response) => {
      response.setStatusLine("1.1", 404, "Not Found");
    });
    await Assert.rejects(transport.watchNotifications("a".repeat(64), { onChange: () => {} }),
      error => error.status === 404);
  });
});
