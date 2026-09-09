/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { LIST_DESCRIPTOR_ORIGIN_CATALOG, LIST_DESCRIPTOR_ORIGIN_CUSTOM } =
  ChromeUtils.importESModule(
    "resource:///modules/internal/ListCatalog.sys.mjs"
  );
const {
  LIST_FETCH_TIMEOUT_MS,
  LIST_REFRESH_INTERVAL_MS,
  LIST_RETRY_INITIAL_MS,
  LIST_RETRY_MAX_MS,
  MAX_LIST_BYTES,
  MAX_LIST_LINE_LENGTH,
  computeListRetryDelay,
  fetchList,
  getListFetchRedirectMode,
  readListResponseText,
  shouldFetchList,
  validateFetchedList,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/ListUpdates.sys.mjs"
);

function makeHeaders(headers = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      String(value),
    ])
  );

  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function oversizedContentLengthResponse(readBody) {
  return {
    body: {
      getReader() {
        readBody();
        throw new Error("Oversized list body should not be read");
      },
    },
    headers: makeHeaders({
      "Content-Length": MAX_LIST_BYTES + 1,
    }),
    ok: true,
    status: 200,
    text() {
      readBody();
      throw new Error("Oversized list body should not be read");
    },
  };
}

function streamingResponse(chunks, headers = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  let cancelReason = null;
  let cancelled = false;

  const reader = {
    async read() {
      if (index >= chunks.length) {
        return { done: true };
      }
      return {
        done: false,
        value: encoder.encode(chunks[index++]),
      };
    },
    async cancel(reason) {
      cancelled = true;
      cancelReason = reason;
    },
  };

  return {
    get cancelReason() {
      return cancelReason;
    },
    get cancelled() {
      return cancelled;
    },
    response: {
      body: {
        getReader() {
          return reader;
        },
      },
      headers: makeHeaders(headers),
      ok: true,
      status: 200,
      type: "basic",
    },
  };
}

function opaqueRedirectResponse() {
  return {
    body: null,
    headers: makeHeaders(),
    ok: false,
    status: 0,
    text() {
      throw new Error("Redirect response body should not be read");
    },
    type: "opaqueredirect",
  };
}

async function withMockedFetch(fetchImpl, task) {
  await task(fetchImpl);
}

add_task(async function test_read_list_response_rejects_content_length() {
  let didReadBody = false;

  await Assert.rejects(
    readListResponseText(
      oversizedContentLengthResponse(() => {
        didReadBody = true;
      })
    ),
    /Fetched list exceeds/,
    "Oversized Content-Length should reject the list"
  );

  Assert.equal(
    didReadBody,
    false,
    "Content-Length rejection should not read the response body"
  );
});

add_task(async function test_read_list_response_rejects_streaming_over_cap() {
  const stream = streamingResponse(["x".repeat(MAX_LIST_BYTES), "x"], {
    "Content-Length": MAX_LIST_BYTES,
  });

  await Assert.rejects(
    readListResponseText(stream.response),
    /Fetched list exceeds/,
    "Streaming reads should reject when the decoded body exceeds the cap"
  );

  Assert.equal(
    stream.cancelled,
    true,
    "Overflowing streams should be cancelled"
  );
  Assert.equal(
    stream.cancelReason?.message,
    `Fetched list exceeds ${MAX_LIST_BYTES} bytes`,
    "Stream cancellation should receive the overflow error"
  );
});

add_task(async function test_read_list_response_counts_encoded_bytes() {
  const response = {
    body: null,
    headers: makeHeaders(),
    ok: true,
    status: 200,
    async text() {
      return "é".repeat(MAX_LIST_BYTES / 2 + 1);
    },
  };

  await Assert.rejects(
    readListResponseText(response),
    /Fetched list exceeds/,
    "The list ceiling should count encoded bytes"
  );
});

add_task(function test_fetched_list_validation_rejects_error_documents() {
  Assert.throws(
    () =>
      validateFetchedList(
        {
          headers: makeHeaders({
            "Content-Type": "text/html; charset=utf-8",
          }),
        },
        "example.com##.ad\n"
      ),
    /Unexpected filter list content type/,
    "An HTML response MIME type should not replace a valid list"
  );
  Assert.throws(
    () =>
      validateFetchedList(
        { headers: makeHeaders() },
        "<!doctype html><title>Server error</title>"
      ),
    /HTML document/,
    "An HTML error body should not replace a valid list"
  );
  Assert.throws(
    () =>
      validateFetchedList(
        { headers: makeHeaders() },
        "! list temporarily unavailable\n"
      ),
    /no filter rules/,
    "A comment-only response should not replace a valid list"
  );
  Assert.throws(
    () =>
      validateFetchedList(
        { headers: makeHeaders() },
        `${"x".repeat(MAX_LIST_LINE_LENGTH + 1)}\n`
      ),
    /line exceeds/,
    "Pathological lines should be rejected before parsing"
  );
});

add_task(async function test_fetch_list_rejects_oversized_content_length() {
  const descriptor = {
    filename: "oversized.txt",
    url: "https://example.com/oversized.txt",
  };
  let didReadBody = false;
  let fetchOptions = null;

  await withMockedFetch(
    async (_url, options) => {
      fetchOptions = options;
      return oversizedContentLengthResponse(() => {
        didReadBody = true;
      });
    },
    async mockFetch => {
      await Assert.rejects(
        fetchList(
          descriptor,
          null,
          false,
          getListFetchRedirectMode(descriptor),
          mockFetch
        ),
        /Fetched list exceeds/,
        "Oversized lists should be rejected"
      );
    }
  );

  Assert.equal(
    didReadBody,
    false,
    "List fetch should reject before reading the oversized body"
  );
  Assert.equal(
    fetchOptions?.redirect,
    "manual",
    "Unknown-origin list fetches should fail safe and not follow redirects"
  );
  Assert.equal(
    fetchOptions?.credentials,
    "omit",
    "List fetches should never include credentials"
  );
  Assert.equal(
    fetchOptions?.referrerPolicy,
    "no-referrer",
    "List fetches should not disclose a referrer"
  );
  Assert.ok(fetchOptions?.signal, "List fetches should have an abort signal");
});

add_task(async function test_curated_list_fetch_follows_redirects() {
  const body = "! curated list\nexample.com##.ad\n";
  const lastModified = "Wed, 21 Oct 2015 07:28:00 GMT";
  const descriptor = {
    filename: "curated.txt",
    listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
    url: "https://example.com/curated.txt",
  };
  let fetchOptions = null;
  let result = null;

  await withMockedFetch(
    async (_url, options) => {
      fetchOptions = options;
      return streamingResponse([body], {
        "Content-Length": body.length,
        ETag: '"curated"',
        "Last-Modified": lastModified,
      }).response;
    },
    async mockFetch => {
      result = await fetchList(
        descriptor,
        null,
        false,
        getListFetchRedirectMode(descriptor),
        mockFetch
      );
    }
  );

  Assert.equal(
    fetchOptions?.redirect,
    "follow",
    "Curated catalog lists should follow redirects"
  );
  Assert.deepEqual(
    result,
    {
      etag: '"curated"',
      lastModified,
      notModified: false,
      text: body,
    },
    "Curated list fetches should return the response text and metadata"
  );
});

add_task(async function test_custom_list_redirect_is_rejected() {
  const descriptor = {
    filename: "custom.txt",
    listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
    url: "https://example.com/custom.txt",
  };
  let fetchOptions = null;

  await withMockedFetch(
    async (_url, options) => {
      fetchOptions = options;
      return opaqueRedirectResponse();
    },
    async mockFetch => {
      await Assert.rejects(
        fetchList(
          descriptor,
          null,
          false,
          getListFetchRedirectMode(descriptor),
          mockFetch
        ),
        /custom list URL redirected; redirects are not followed/,
        "Custom list redirects should get a distinct error"
      );
    }
  );

  Assert.equal(
    fetchOptions?.redirect,
    "manual",
    "Custom list fetches should not follow redirects"
  );
});

add_task(async function test_curated_list_rejects_https_downgrade() {
  const descriptor = {
    filename: "curated.txt",
    listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
    url: "https://example.com/curated.txt",
  };
  const response = streamingResponse(["example.com##.ad\n"]).response;
  response.url = "http://cdn.example.com/curated.txt";

  await Assert.rejects(
    fetchList(
      descriptor,
      null,
      false,
      getListFetchRedirectMode(descriptor),
      async () => response
    ),
    /redirected outside HTTPS/,
    "Curated list redirects must remain on HTTPS"
  );
});

add_task(async function test_curated_304_rejects_https_downgrade() {
  const descriptor = {
    filename: "curated.txt",
    listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
    url: "https://example.com/curated.txt",
  };
  const response = streamingResponse([]).response;
  response.ok = false;
  response.status = 304;
  response.url = "http://cdn.example.com/curated.txt";

  await Assert.rejects(
    fetchList(
      descriptor,
      { etag: '"current"' },
      true,
      getListFetchRedirectMode(descriptor),
      async () => response
    ),
    /redirected outside HTTPS/,
    "Conditional responses must also remain on HTTPS"
  );
});

add_task(async function test_list_fetch_has_bounded_duration() {
  const descriptor = {
    filename: "timeout.txt",
    listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
    url: "https://example.com/timeout.txt",
  };
  let fetchSignal = null;

  await Assert.rejects(
    fetchList(
      descriptor,
      null,
      false,
      getListFetchRedirectMode(descriptor),
      async (_url, options) => {
        fetchSignal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted by timeout")),
            { once: true }
          );
        });
      },
      1
    ),
    /aborted by timeout/,
    "A list request should be aborted after its deadline"
  );

  Assert.equal(
    LIST_FETCH_TIMEOUT_MS,
    30 * 1000,
    "The production deadline should remain bounded"
  );
  Assert.equal(fetchSignal?.aborted, true, "The fetch signal should be aborted");
});

add_task(function test_list_refresh_and_retry_schedule() {
  const now = 1_000_000_000;

  Assert.equal(
    shouldFetchList({ lastFetched: now }, now, false),
    false,
    "A freshly fetched list should not be downloaded again"
  );
  Assert.equal(
    shouldFetchList(
      { lastFetched: now - LIST_REFRESH_INTERVAL_MS },
      now,
      false
    ),
    true,
    "A list should become eligible after its refresh interval"
  );
  Assert.equal(
    shouldFetchList({ nextAttempt: now + 1 }, now, true),
    true,
    "A manual refresh should override the schedule"
  );
  Assert.equal(
    computeListRetryDelay(1, () => 0.5),
    LIST_RETRY_INITIAL_MS,
    "The first retry should use the initial delay"
  );
  Assert.equal(
    computeListRetryDelay(100, () => 0.5),
    LIST_RETRY_MAX_MS,
    "Retry delays should be capped"
  );
  Assert.notEqual(
    computeListRetryDelay(2, () => 0),
    computeListRetryDelay(2, () => 1),
    "Retry delays should include jitter"
  );
});
