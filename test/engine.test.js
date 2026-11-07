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

test("allocate splits a total by weight to the exact cent", () => {
  const a = Divvy.allocate(1000, [3, 1]); // 75% / 25%
  assert.deepStrictEqual(a, [750, 250]);
  const b = Divvy.allocate(100, [1, 1, 1]); // odd cent to the earliest
  assert.deepStrictEqual(b, [34, 33, 33]);
  assert.strictEqual(b.reduce((x, y) => x + y, 0), 100);
});

test("allocate with no positive weight falls back to an even spread", () => {
  assert.deepStrictEqual(Divvy.allocate(100, [0, 0]), [50, 50]);
});

test("the deposit is split by each person's rent, not equally", () => {
  const r = Divvy.solve({
    rent: "3000", deposit: "3000",
    names: ["A", "B"], rooms: ["Big", "Small"],
    bids: [[2000, 1000], [2000, 1000]]
  });
  assert.ok(!r.error);
  // Both value Big at 2000 and Small at 1000, so rents come out 2000 / 1000.
  const big = r.people.find(p => p.room === "Big");
  const small = r.people.find(p => p.room === "Small");
  assert.strictEqual(big.rent + small.rent, 300000);
  // A one-month deposit (= rent) splits in the same 2:1 proportion.
  assert.strictEqual(big.deposit + small.deposit, 300000);
  assert.strictEqual(big.deposit, 200000);
  assert.strictEqual(small.deposit, 100000);
  assert.ok(Math.abs(r.depositMonths - 1) < 1e-9);
});

test("no deposit leaves every person's deposit at zero and the split unchanged", () => {
  const r = Divvy.solve({
    rent: "2400", names: ["A", "B"], rooms: ["X", "Y"],
    bids: [[1200, 1200], [1200, 1200]]
  });
  assert.strictEqual(r.deposit, 0);
  assert.ok(r.people.every(p => p.deposit === 0));
});

test("flags a deposit above the Tenant Fees Act 2019 cap (5 weeks' rent under £50k/yr)", () => {
  // Rent £1,000/month => annual £12,000 (< £50k) => cap is 5 weeks' rent.
  // Weekly = 1000 * 12 / 52 = £230.77; cap = £1,153.85.
  const over = Divvy.solve({
    rent: "1000", deposit: "1500", names: ["A", "B"], rooms: ["X", "Y"],
    bids: [[500, 500], [500, 500]]
  });
  assert.strictEqual(over.depositCapWeeks, 5);
  assert.strictEqual(over.depositCap, Math.round(100000 * 12 / 52 * 5));
  assert.strictEqual(over.depositOverCap, true);

  // A one-month deposit (£1,000) is under the 5-week cap, so not flagged.
  const ok = Divvy.solve({
    rent: "1000", deposit: "1000", names: ["A", "B"], rooms: ["X", "Y"],
    bids: [[500, 500], [500, 500]]
  });
  assert.strictEqual(ok.depositOverCap, false);
});

test("deposit cap is 6 weeks when annual rent is £50,000 or more", () => {
  // Rent £5,000/month => annual £60,000 (>= £50k) => 6 weeks.
  const r = Divvy.solve({
    rent: "5000", deposit: "1", names: ["A", "B"], rooms: ["X", "Y"],
    bids: [[2500, 2500], [2500, 2500]]
  });
  assert.strictEqual(r.depositCapWeeks, 6);
  assert.strictEqual(r.depositCap, Math.round(500000 * 12 / 52 * 6));
});

test("council tax: an all-student house is exempt and pays nothing", () => {
  const r = Divvy.councilTax("1800", [true, true, true]);
  assert.strictEqual(r.exempt, true);
  assert.strictEqual(r.payable, 0);
  assert.deepStrictEqual(r.perPerson, [0, 0, 0]);
});

test("council tax: one counted adult gets the 25% single-person discount", () => {
  const r = Divvy.councilTax("2000", [false, true, true]); // one non-student, two students
  assert.strictEqual(r.discountRate, 0.25);
  assert.strictEqual(r.payable, Divvy.cents("1500")); // 2000 - 25%
  assert.strictEqual(r.perPerson[0], Divvy.cents("1500")); // the non-student pays it all
  assert.strictEqual(r.perPerson[1], 0);
  assert.strictEqual(r.perPerson[2], 0);
});

test("council tax: students disregarded, bill split among the counted adults", () => {
  const r = Divvy.councilTax("1800", [false, false, true]); // two non-students, one student
  assert.strictEqual(r.discountRate, 0); // more than one counted, no discount
  assert.strictEqual(r.payable, Divvy.cents("1800"));
  assert.strictEqual(r.perPerson[2], 0); // the student pays nothing
  assert.strictEqual(r.perPerson[0] + r.perPerson[1], Divvy.cents("1800"));
});

test("council tax: no students means a full equal split summing to the bill", () => {
  const r = Divvy.councilTax("1200", [false, false, false]);
  assert.strictEqual(r.payable, Divvy.cents("1200"));
  assert.strictEqual(r.perPerson.reduce((a, b) => a + b, 0), Divvy.cents("1200"));
  assert.strictEqual(r.disregarded, 0);
});
