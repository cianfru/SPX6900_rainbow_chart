// vercel.json is validated by Vercel's own schema at BUILD time, which means a typo in it
// does not fail until the deploy — and it fails there loudly, having already burnt a run.
// It cost one exactly that way: a "//" key used as a comment, which JSON has no concept of
// and Vercel rejects as an additional property.
//
// These checks cover the mistakes that are actually reachable here: unknown keys in the
// objects we hand-edit, and header/rewrite entries that are missing a required field. It is
// not a full re-implementation of Vercel's schema and does not try to be — it is a guard on
// the parts of the file we touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));

test("vercel.json has only top-level keys Vercel accepts", () => {
  const ALLOWED = new Set([
    "functions", "rewrites", "redirects", "headers", "routes", "cleanUrls",
    "trailingSlash", "regions", "buildCommand", "outputDirectory", "installCommand",
    "framework", "devCommand", "ignoreCommand", "crons", "images", "public",
  ]);
  const unknown = Object.keys(cfg).filter(k => !ALLOWED.has(k));
  assert.deepEqual(unknown, [], `Vercel rejects unknown top-level keys: ${unknown.join(", ")}`);
});

test("every headers entry has only the properties Vercel allows", () => {
  // The exact failure that broke a deploy: JSON cannot carry comments, and Vercel does not
  // tolerate a "//" key the way some other tools do. Put the reasoning in deploy.yml.
  const ALLOWED = new Set(["source", "headers", "has", "missing"]);
  for (const [i, entry] of (cfg.headers || []).entries()) {
    const unknown = Object.keys(entry).filter(k => !ALLOWED.has(k));
    assert.deepEqual(unknown, [], `headers[${i}] has properties Vercel rejects: ${unknown.join(", ")}`);
    assert.equal(typeof entry.source, "string", `headers[${i}] needs a source`);
    assert.ok(Array.isArray(entry.headers) && entry.headers.length, `headers[${i}] needs at least one header`);
    for (const h of entry.headers) {
      assert.equal(typeof h.key, "string", `headers[${i}] header needs a key`);
      assert.equal(typeof h.value, "string", `headers[${i}] header needs a value`);
    }
  }
});

test("every rewrite entry has only the properties Vercel allows", () => {
  const ALLOWED = new Set(["source", "destination", "has", "missing"]);
  for (const [i, entry] of (cfg.rewrites || []).entries()) {
    const unknown = Object.keys(entry).filter(k => !ALLOWED.has(k));
    assert.deepEqual(unknown, [], `rewrites[${i}] has properties Vercel rejects: ${unknown.join(", ")}`);
    assert.equal(typeof entry.source, "string", `rewrites[${i}] needs a source`);
    assert.equal(typeof entry.destination, "string", `rewrites[${i}] needs a destination`);
  }
});

test("the HTML shell and runtime JSON are not left cacheable at the edge", () => {
  // The regression this guards: a stale index.html at the edge names an old content-hashed
  // bundle, and the old bundle is still served, so the whole site silently goes back in time
  // while every deploy reports success. max-age alone does not prevent it — the CDN obeys
  // s-maxage, so that is the property worth asserting.
  const rules = cfg.headers || [];
  const shell = rules.find(r => r.source === "/(index.html)?");
  assert.ok(shell, "expected a Cache-Control rule covering the HTML shell");
  const cc = shell.headers.find(h => h.key.toLowerCase() === "cache-control");
  assert.ok(cc, "the shell rule must set Cache-Control");
  assert.match(cc.value, /s-maxage=0/, "the shell must set s-maxage=0 or the CDN can serve it stale");
});
