import assert from "node:assert/strict";
import test from "node:test";

import { getWindowChange } from "./market-change";

test("window change prefers an exact reference price", () => {
  const change = getWindowChange(125, 100, [{ price: 80 }, { price: 125 }]);

  assert.equal(change, 25);
});

test("window change falls back to earliest cached price when exact reference is missing", () => {
  const change = getWindowChange(150, null, [
    { price: 100 },
    { price: 120 },
    { price: 150 },
  ]);

  assert.equal(change, 50);
});

test("window change stays unavailable with fewer than two usable prices", () => {
  const change = getWindowChange(150, null, [{ price: 150 }]);

  assert.equal(change, null);
});
