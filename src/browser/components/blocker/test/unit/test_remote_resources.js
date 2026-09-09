/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const {
  MAX_BUNDLE_BYTES,
  MAX_BUNDLE_ENTRIES,
  REMOTE_RESOURCE_FETCH_TIMEOUT_MS,
  REMOTE_RESOURCE_REFRESH_INTERVAL_MS,
  REMOTE_RESOURCE_RETRY_INITIAL_MS,
  REMOTE_RESOURCE_RETRY_MAX_MS,
  computeRemoteResourceRetryDelay,
  fetchBundle,
  readBundleResponseText,
  shouldRefreshRemoteResource,
  validateBundleText,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/RemoteResources.sys.mjs"
);

function makeHeaders(headers = {}) {
  const values = new Map(
    Object.entries(headers).map(([name, value]) => [
      name.toLowerCase(),
      String(value),
    ])
  );
  return {
    get(name) {
      return values.get(name.toLowerCase()) ?? null;
    },
  };
}

function makeResponse(text, headers = {}) {
  return {
    body: null,
    headers: makeHeaders(headers),
    ok: true,
    status: 200,
    async text() {
      return text;
    },
  };
}

add_task(function test_bundle_limit_counts_encoded_bytes() {
  Assert.throws(
    () => validateBundleText("é".repeat(MAX_BUNDLE_BYTES / 2 + 1)),
    /bundle exceeds/,
    "The bundle ceiling should count encoded bytes"
  );
});

add_task(function test_bundle_shape_is_bounded_and_unambiguous() {
  const resource = index => ({
    name: `resource-${index}`,
    content: "",
    kind: { mime: "text/plain" },
  });
  Assert.throws(
    () =>
      validateBundleText(
        JSON.stringify(
          Array.from({ length: MAX_BUNDLE_ENTRIES + 1 }, (_, index) =>
            resource(index)
          )
        )
      ),
    /exceeds .* entries/,
    "Resource bundles should have a bounded entry count"
  );
  Assert.throws(
    () =>
      validateBundleText(
        JSON.stringify([
          { ...resource(1), aliases: ["shared"] },
          { ...resource(2), aliases: ["shared"] },
        ])
      ),
    /duplicate resource identifier/,
    "Resource names and aliases must be unique"
  );
});

add_task(async function test_content_length_rejects_before_body_read() {
  let bodyRead = false;
  const response = makeResponse("[]", {
    "Content-Length": MAX_BUNDLE_BYTES + 1,
  });
  response.text = async () => {
    bodyRead = true;
    return "[]";
  };

  await Assert.rejects(
    readBundleResponseText(response),
    /bundle exceeds/,
    "An oversized declared body should be rejected"
  );
  Assert.equal(bodyRead, false, "The oversized body should not be read");
});

add_task(async function test_remote_fetch_is_private_and_bounded() {
  const bundle = {
    name: "test",
    url: "https://update.astian.org/v2/blocker/test.json",
  };
  let fetchOptions = null;
  const result = await fetchBundle(bundle, '"old"', async (_url, options) => {
    fetchOptions = options;
    return makeResponse("[]", { ETag: '"new"' });
  });

  Assert.deepEqual(
    result,
    { etag: '"new"', notModified: false, text: "[]" },
    "The validated response should retain its cache validator"
  );
  Assert.equal(fetchOptions.credentials, "omit", "Credentials must be omitted");
  Assert.equal(fetchOptions.redirect, "error", "Redirects must be rejected");
  Assert.equal(
    fetchOptions.referrerPolicy,
    "no-referrer",
    "A referrer must not be disclosed"
  );
  Assert.ok(fetchOptions.signal, "The request should have an abort signal");
});

add_task(async function test_remote_fetch_rejects_unvalidated_304() {
  const bundle = {
    name: "test",
    url: "https://update.astian.org/v2/blocker/test.json",
  };
  const response = makeResponse("");
  response.ok = false;
  response.status = 304;

  await Assert.rejects(
    fetchBundle(bundle, "", async () => response),
    /without a cache validator/,
    "A 304 must not accept an unvalidated local bundle"
  );

  Assert.deepEqual(
    await fetchBundle(bundle, '"old"', async () => response),
    { notModified: true },
    "A 304 should be accepted when the request sent a validator"
  );
});

add_task(async function test_remote_fetch_timeout() {
  const bundle = {
    name: "timeout",
    url: "https://update.astian.org/v2/blocker/timeout.json",
  };
  let fetchSignal = null;

  await Assert.rejects(
    fetchBundle(
      bundle,
      "",
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
    "The remote resource request should be aborted after its deadline"
  );

  Assert.equal(
    REMOTE_RESOURCE_FETCH_TIMEOUT_MS,
    30 * 1000,
    "The production deadline should remain bounded"
  );
  Assert.equal(fetchSignal?.aborted, true, "The fetch signal should be aborted");
});

add_task(function test_remote_resource_refresh_and_retry_schedule() {
  const now = 1_000_000_000;

  Assert.equal(
    shouldRefreshRemoteResource({ lastFetched: now }, now),
    false,
    "A fresh resource bundle should not be fetched again"
  );
  Assert.equal(
    shouldRefreshRemoteResource(
      { lastFetched: now - REMOTE_RESOURCE_REFRESH_INTERVAL_MS },
      now
    ),
    true,
    "A resource bundle should become eligible after its refresh interval"
  );
  Assert.equal(
    shouldRefreshRemoteResource({ nextAttempt: now + 1 }, now, true),
    true,
    "A manual refresh should override the resource schedule"
  );
  Assert.equal(
    computeRemoteResourceRetryDelay(1, () => 0.5),
    REMOTE_RESOURCE_RETRY_INITIAL_MS,
    "The first resource retry should use the initial delay"
  );
  Assert.equal(
    computeRemoteResourceRetryDelay(100, () => 0.5),
    REMOTE_RESOURCE_RETRY_MAX_MS,
    "Resource retry delays should be capped"
  );
  Assert.notEqual(
    computeRemoteResourceRetryDelay(2, () => 0),
    computeRemoteResourceRetryDelay(2, () => 1),
    "Resource retries should include jitter"
  );
});
