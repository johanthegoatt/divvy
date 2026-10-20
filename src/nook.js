// Nook, the little house in the corner. Nook's windows are eyes that follow
// your pointer (or the box you're typing in on a phone), blinks now and then,
// gives a tip for the step you're on when tapped, opens the door and puffs the
// chimney when a fair split comes out, looks worried when something doesn't add
// up, and drops a few keys if you tap five times fast. Everything Nook says
// goes through the bubble's live region, so a screen reader hears it too.
(function () {
  "use strict";
  var btn = document.getElementById("nook");
  var bubble = document.getElementById("nook-bubble");
  var dock = document.getElementById("nook-dock");
  var hide = document.getElementById("nook-hide");
  if (!btn) {
    window.Nook = { context: function () {}, react: function () {}, say: function () {} };
    return;
  }

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "idle", tipKey = "start";
  var bubbleTimer = null, tapTimes = [], tipIndex = {};

  var TIPS = {
    start: [
      "Hi, I'm Nook! Put in the total rent, then name each room.",
      "One room per person. Add a room and a person until everyone's in.",
      "Stuck for a start? Tap Try an example and I'll fill one in."
    ],
    bids: [
      "For each person, spread the rent over the rooms the way they'd happily pay.",
      "Put more on the room someone really wants. That's how they get first pick of it.",
      "The amounts are a wish, not a bill. They don't have to add up exactly."
    ],
    done: [
      "Everyone's glad of their own room at its price. That's the fair bit.",
      "Tap Copy it for the group chat and paste it where everyone can see.",
      "Want to change a bid? Edit it and work out the split again."
    ],
    worried: [
      "You need the same number of people and rooms, one each.",
      "Put in a total rent first and I'll do the rest."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms);
  }

  function tip() {
    var list = TIPS[tipKey] || TIPS.start;
    var i = (tipIndex[tipKey] || 0) % list.length;
    tipIndex[tipKey] = i + 1;
    say(list[i], 7000);
  }

  // Eyes (the windows' dots) follow the pointer a little.
  var eyes = btn.querySelectorAll(".n-eye");
  function look(x, y) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    var dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width)));
    var dy = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (r.height)));
    eyes.forEach(function (e) { e.style.transform = "translate(" + (dx * 1.6) + "px," + (dy * 1.6) + "px)"; });
  }
  window.addEventListener("pointermove", function (e) { look(e.clientX, e.clientY); });
  document.addEventListener("focusin", function (e) {
    var t = e.target.getBoundingClientRect();
    look(t.left + t.width / 2, t.top + t.height / 2);
  });

  // Blink.
  function blink() {
    if (still.matches) return;
    btn.classList.add("blink");
    setTimeout(function () { btn.classList.remove("blink"); }, 150);
  }
  setInterval(function () { if (Math.random() < 0.5) blink(); }, 4200);

  function keys() {
    if (still.matches) return;
    for (var i = 0; i < 6; i++) {
      (function (i) {
        var k = document.createElement("div");
        k.className = "key"; k.textContent = "🔑";
        var r = btn.getBoundingClientRect();
        k.style.left = (r.left + r.width / 2) + "px";
        k.style.top = (r.top) + "px";
        document.body.appendChild(k);
        var dx = (Math.random() * 160 - 80), t = 700 + Math.random() * 500;
        k.animate(
          [{ transform: "translate(0,0) rotate(0)", opacity: 1 },
           { transform: "translate(" + dx + "px," + (window.innerHeight - r.top + 40) + "px) rotate(" + (dx) + "deg)", opacity: 0 }],
          { duration: t, easing: "cubic-bezier(.4,.1,.7,1)" }
        ).onfinish = function () { k.remove(); };
      })(i);
    }
  }

  btn.addEventListener("click", function () {
    tapTimes.push(Date.now());
    tapTimes = tapTimes.filter(function (t) { return Date.now() - t < 1500; });
    if (tapTimes.length >= 5) { tapTimes = []; keys(); say("Here, have the keys!", 3000); return; }
    tip();
    if (!still.matches) { btn.classList.add("hop"); setTimeout(function () { btn.classList.remove("hop"); }, 500); }
  });

  hide.addEventListener("click", function () {
    dock.classList.toggle("tucked");
    hide.textContent = dock.classList.contains("tucked") ? "show" : "tuck";
  });

  window.Nook = {
    // Set the step Nook talks about and its resting mood.
    context: function (key) {
      tipKey = key;
      baseMood = key === "worried" ? "worried" : (key === "done" ? "happy" : "idle");
      setMood(baseMood);
    },
    // A one-off reaction to something that just happened.
    react: function (key) {
      if (key === "done") { setMood("happy"); say("There you go. Everyone's happy with their own room.", 6000); if (!still.matches) keys(); }
      else if (key === "worried") { setMood("worried"); }
      else if (key === "thinking") { setMood("thinking"); setTimeout(function () { setMood(baseMood); }, 1200); }
      else if (key === "copied") { say("Copied. Paste it in the group chat.", 3500); }
      else if (key === "link") { say("Link copied. Whoever opens it sees the same split.", 4000); }
    },
    say: say
  };

  setTimeout(function () { if (!dock.classList.contains("tucked")) tip(); }, 900);
})();
