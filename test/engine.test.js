"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Divvy = require("../src/engine.js");

test("reads amounts into whole cents", () => {
  assert.strictEqual(Divvy.cents("1,234.50"), 123450);
  assert.strictEqual(Divvy.cents("1.234,50"), 123450);
  assert.strictEqual(Divvy.cents("£900"), 90000);
  assert.strictEqual(Divvy.cents("900"), 90000);
  assert.strictEqual(Divvy.cents("900.5"), 90050);
  assert.strictEqual(Divvy.cents("2,400"), 240000);
  assert.strictEqual(Divvy.cents("-5"), null);
  assert.strictEqual(Divvy.cents("abc"), null);
});

test("a person's bids are scaled to add up to the rent exactly", () => {
  const row = Divvy.normalizeRow([1000, 800, 600], 240000); // sums to 2400 after /2400
  assert.strictEqual(row.reduce((a, b) => a + b, 0), 240000);
  // Order of likes is kept: first room worth the most.
  assert.ok(row[0] > row[1] && row[1] > row[2]);
});

test("someone who bids nothing likes every room the same", () => {
  const row = Divvy.normalizeRow([0, 0, 0], 300000);
  assert.deepStrictEqual(row, [100000, 100000, 100000]);
});

test("rents always add up to the real total", () => {
  const r = Divvy.solve({
    rent: "2400",
    names: ["A", "B", "C"],
    rooms: ["Big", "Mid", "Small"],
    bids: [[1000, 800, 600], [900, 900, 600], [700, 900, 800]]
  });
  assert.ok(!r.error);
  assert.strictEqual(r.prices.reduce((a, b) => a + b, 0), 240000);
});

test("the person who wants the big room most ends up in it", () => {
  const r = Divvy.solve({
    rent: "3000",
    names: ["Loves big", "Easy", "Wants small"],
    rooms: ["Big", "Mid", "Small"],
    bids: [[2000, 700, 300], [1000, 1000, 1000], [600, 900, 1500]]
  });
  const big = r.people.find((p) => p.room === "Big");
  const small = r.people.find((p) => p.room === "Small");
  assert.strictEqual(big.name, "Loves big");
  assert.strictEqual(small.name, "Wants small");
  // Everyone is happy with their own room at its rent (no swap helps).
  assert.ok(r.envyFree);
});

test("two people, one clearly nicer room: the keen one pays more and both are happy", () => {
  const r = Divvy.solve({
    rent: "1000",
    names: ["Keen", "Thrifty"],
    rooms: ["Ensuite", "Box"],
    bids: [[800, 200], [550, 450]]
  });
  assert.ok(r.envyFree);
  const keen = r.people.find((p) => p.name === "Keen");
  assert.strictEqual(keen.room, "Ensuite");
  assert.ok(keen.rent > 50000); // pays more than half
});

test("needs a rent and at least two people", () => {
  assert.ok(Divvy.solve({ rent: "0", bids: [[1], [1]] }).error);
  assert.ok(Divvy.solve({ rent: "1000", bids: [[1]] }).error);
});

// The heart of it: on many random setups, the answer must be envy-free (nobody
// prefers another room at its rent, to the cent) and the rents must total the
// rent. Checked here by brute force, independently of the engine's own check.
test("random setups are always envy-free and sum to the rent", () => {
  let rng = 123456789;
  const rand = (lo, hi) => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return lo + (rng % (hi - lo + 1));
  };
  for (let trial = 0; trial < 500; trial++) {
    const n = rand(2, 6);
    const rent = rand(500, 5000) * 100; // whole dollars in cents
    const names = [], rooms = [], bids = [];
    for (let i = 0; i < n; i++) {
      names.push("P" + i);
      rooms.push("R" + i);
      const row = [];
      for (let j = 0; j < n; j++) row.push(rand(0, 2000));
      bids.push(row);
    }
    const r = Divvy.solve({ rent: String(rent / 100), names, rooms, bids });
    assert.ok(!r.error, "no error on trial " + trial);
    assert.strictEqual(r.prices.reduce((a, b) => a + b, 0), rent, "sum on trial " + trial);

    // Rebuild the normalized values to check envy independently.
    const value = bids.map((row) => Divvy.normalizeRow(row, rent));
    const roomOf = {};
    r.people.forEach((p) => { roomOf[p.name] = p.roomIndex; });
    for (let i = 0; i < n; i++) {
      const mine = value[i][roomOf["P" + i]] - r.prices[roomOf["P" + i]];
      for (let k = 0; k < n; k++) {
        const other = value[i][k] - r.prices[k];
        assert.ok(other - mine <= 1, "envy on trial " + trial + " person " + i);
      }
    }
  }
});

test("the engine's own envy-free flag agrees with the brute-force check", () => {
  const r = Divvy.solve({
    rent: "1800",
    names: ["A", "B", "C"],
    rooms: ["R1", "R2", "R3"],
    bids: [[900, 600, 300], [600, 900, 300], [300, 600, 900]]
  });
  assert.ok(r.envyFree);
  assert.ok(r.worstEnvy <= 1);
});

test("shared bills split equally on top of the rent, to the cent", () => {
  const r = Divvy.solve({
    rent: "2400",
    bills: "120",
    names: ["A", "B", "C"],
    rooms: ["Big", "Mid", "Small"],
    bids: [[1000, 800, 600], [900, 900, 600], [700, 900, 800]]
  });
  assert.ok(!r.error);
  assert.strictEqual(r.bills, 12000);
  // Each person's bill share adds up to the whole bill.
  assert.strictEqual(r.people.reduce((a, p) => a + p.bills, 0), 12000);
  // 120 over 3 is exactly 40 each.
  r.people.forEach((p) => assert.strictEqual(p.bills, 4000));
  // The total is the room rent plus the bill share.
  r.people.forEach((p) => assert.strictEqual(p.total, p.rent + p.bills));
  // The totals still add up to rent plus bills.
  assert.strictEqual(r.people.reduce((a, p) => a + p.total, 0), 240000 + 12000);
});

test("no bills means a zero share and total equal to rent", () => {
  const r = Divvy.solve({
    rent: "1500",
    names: ["A", "B"],
    rooms: ["One", "Two"],
    bids: [[900, 600], [700, 800]]
  });
  assert.strictEqual(r.bills, 0);
  r.people.forEach((p) => { assert.strictEqual(p.bills, 0); assert.strictEqual(p.total, p.rent); });
});

test("an odd bill still splits to the cent", () => {
  const r = Divvy.solve({
    rent: "1000",
    bills: "100.01",
    names: ["A", "B", "C"],
    rooms: ["One", "Two", "Three"],
    bids: [[500, 300, 200], [300, 500, 200], [200, 300, 500]]
  });
  assert.strictEqual(r.people.reduce((a, p) => a + p.bills, 0), 10001);
});
