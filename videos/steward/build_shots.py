"""Writes shots.json for the Steward film (the scene designs, beat by beat)."""
import json
from pathlib import Path


def box(i, at, x, y, w, h, label, sub="", icon="none", tone="plain"):
    return dict(id=i, kind="box", at=at, x=x, y=y, w=w, h=h, label=label, sub=sub, icon=icon, tone=tone)


def chip(i, at, x, y, w, h, text, tone="soft"):
    return dict(id=i, kind="chip", at=at, x=x, y=y, w=w, h=h, text=text, tone=tone)


def arrow(i, at, f, t, **k):
    return dict(id=i, kind="arrow", at=at, **{"from": f, "to": t}, **k)


def stamp(i, at, x, y, w, h, text, tone):
    return dict(id=i, kind="stamp", at=at, x=x, y=y, w=w, h=h, text=text, tone=tone)


def act(at, do, target, **k):
    return dict(at=at, do=do, target=target, **k)


def vid(i, at, src, **k):
    # Recordings are 1440x900 (1.6:1); 12 x 7.5 units keeps that shape.
    return dict(id=i, kind="video", at=at, x=2, y=1.05, w=12, h=7.5, src=src, fit="cover", **k)


def num(i, at, x, y, w, h, v, label, suffix=""):
    return dict(id=i, kind="number", at=at, x=x, y=y, w=w, h=h, value=v, label=label, suffix=suffix)


S = []


def shot(beat, elements=(), actions=(), transition=None):
    d = dict(beat=beat, elements=list(elements), actions=list(actions))
    if transition:
        d["transition"] = transition
    S.append(d)


# 1 - the question
shot(0, [box("agent", "agents", 1.2, 2.4, 4.4, 1.4, "AI agent", "manages deposits", "cpu")], transition="cut")
shot(1, [box("vault", "vault", 10.4, 2.4, 4.6, 1.4, "RWA vault", "tokenized real-world assets", "database", "accent"),
         arrow("move", "deposits", "agent", "vault", label="deposit", flow=True)])
shot(2, [dict(id="q", kind="heading", at="prove", x=2.4, y=5.0, w=11.2, h=1.5, text="What was it *allowed* to do?")],
     [act("allowed", "pulse", "agent")])

# 2 - Steward, and what the model may do
shot(3, [dict(id="title", kind="heading", at="steward", x=0.9, y=1.5, w=8, h=1.4, text="*Steward*"),
         box("ixs", "vault", 10.2, 1.6, 4.9, 1.4, "IXS ManagedVault", "BNB Chain", "database", "accent")], transition="push")
shot(4, [box("model", "model", 0.9, 3.9, 4.2, 1.4, "Model", "typed proposals only", "cpu"),
         chip("d", "deposit", 5.8, 3.6, 2.4, 0.62, "deposit"),
         chip("r", "redeem", 5.8, 4.4, 2.4, 0.62, "redeem"),
         chip("h", "hold", 5.8, 5.2, 2.4, 0.62, "hold")])
shot(5, [chip("n1", "address", 9.6, 3.6, 5.4, 0.62, "name an address", "ghost"),
         chip("n2", "calldata", 9.6, 4.4, 5.4, 0.62, "write calldata", "ghost"),
         chip("n3", "limit", 9.6, 5.2, 5.4, 0.62, "raise a limit", "ghost")],
     [act("address", "cross", "n1"), act("calldata", "cross", "n2"), act("limit", "cross", "n3")])

# 3 - the policy engine
shot(6, [box("prop", "proposal", 0.9, 2.2, 4.0, 1.4, "Proposal", "from the model", "file"),
         box("eng", "engine", 5.8, 2.2, 4.8, 1.4, "Policy engine", "deterministic", "shield", "accent"),
         arrow("p1", "goes", "prop", "eng", flow=True)], transition="slide")
shot(7, [dict(id="checks", kind="list", at="checks", x=5.8, y=4.1, w=4.8, h=2.5,
              items=["the owner's mandate", "the account's capacity", "the vault's liquidity", "fresh evidence"])])
shot(8, [chip("verdict", "allow", 11.3, 2.55, 3.8, 0.7, "ALLOW / REFUSE"),
         arrow("p2", "answers", "eng", "verdict"),
         dict(id="codes", kind="list", at="reason", x=11.3, y=3.7, w=3.8, h=1.9,
              items=["OVER_MAX_TX", "STALE_EVIDENCE", "OWNER_PAUSED"])])
shot(9, [chip("ts", "typescript", 0.9, 7.3, 3.0, 0.65, "TypeScript"),
         chip("py", "python", 4.2, 7.3, 2.4, 0.65, "Python"),
         chip("sol", "chain", 6.9, 7.3, 4.2, 0.65, "Solidity, on chain", "accent")])

# 4 - receipts
shot(10, [box("sc", "action", 1.0, 2.4, 4.8, 1.4, "State change", "deposit, redeem, graduate", "bolt"),
          box("rc", "receipt", 9.8, 2.4, 5.0, 1.4, "Receipt", "bound to the action", "file", "accent"),
          arrow("rb", "bound", "sc", "rc")], transition="zoom")
shot(11, [chip("seq", "sequence", 9.8, 4.3, 5.0, 0.65, "sequence number"),
          chip("hash", "hash", 9.8, 5.2, 5.0, 0.65, "policy-input hash")])
shot(12, [stamp("rev", "reverts", 1.6, 4.6, 3.6, 1.0, "reverts", "bad")], [act("reverts", "cross", "sc")])

# 5 - earned tiers
shot(13, [dict(id="lh", kind="heading", at="tiers", x=0.9, y=1.4, w=9.5, h=1.3, text="Limits are *earned*")], transition="push")
shot(14, [dict(id="tiers", kind="table", at="probation", x=0.9, y=3.1, w=7.6, h=3.8,
               columns=["tier", "name", "max per deposit"],
               rows=[["T0", "Probation", "120"], ["T1", "Trusted", "300"], ["T2", "Established", "600"], ["T3", "Proven", "1000"]])],
     [act("hundred", "highlight", "tiers", rows=[1])])
shot(15, [dict(id="conds", kind="list", at="move", x=9.2, y=3.1, w=5.9, h=3.3,
               items=["time served in the tier", "real risk carried", "authority actually used", "enough receipts", "no incidents"])],
     [act("move", "highlight", "tiers", rows=[2])])
shot(16, [], [act("incidents", "pulse", "conds")])
shot(17, [chip("inc", "drops", 9.2, 6.9, 5.9, 0.65, "incident: demoted", "bad")], [act("down", "highlight", "tiers", rows=[1])])

# 6 - two agents, one request (the public testnet run)
shot(18, [box("b", "two", 1.2, 2.1, 5.4, 1.4, "Agent B", "brand new, tier T0", "user"),
          box("a", "agents", 9.6, 2.1, 5.4, 1.4, "Agent A", "graduated, tier T1", "user"),
          chip("db", "deposit", 1.2, 3.9, 2.8, 0.65, "deposit 200"),
          chip("da", "same", 9.6, 3.9, 2.8, 0.65, "deposit 200")], transition="zoom")
shot(19, [chip("cap", "brand", 4.3, 3.9, 2.3, 0.65, "cap 120", "ghost"),
          stamp("fail", "refuses", 1.5, 5.0, 3.8, 1.0, "OverMaxTx", "bad"),
          dict(id="txb", kind="text", at="transaction", x=1.2, y=6.4, w=5.4, h=0.5,
               text="tx 0x9a8c2923…1492a8c", size="s", tone="muted", mono=True)],
     [act("refuses", "cross", "b")])
shot(20, [chip("up", "graduated", 12.7, 3.9, 2.3, 0.65, "T0 → T1", "accent"),
          stamp("ok", "goes", 9.9, 5.0, 3.6, 1.0, "success", "ok"),
          dict(id="txa", kind="text", at="through", x=9.6, y=6.4, w=5.4, h=0.5,
               text="tx 0x68c77863…1467885", size="s", tone="muted", mono=True)],
     [act("through", "check", "a")])
shot(21, [chip("scan", "explorer", 4.6, 7.4, 6.8, 0.65, "testnet.bscscan.com", "accent")])

# 7-11 - the live site, recorded
shot(22, [vid("walk", "hosted", "walkthrough")], transition="slide")
shot(23)
shot(24, [vid("sim", "simulator", "slider", sync=dict(word="flips", mark=0))], transition="push")
shot(25)
shot(26, [vid("lab", "attack", "attack", sync=dict(word="refused", mark=0), syncEnd=dict(word="pauses", mark=2))], transition="cut")
shot(27)
shot(28)
shot(29)
shot(30, [vid("acct", "live", "account", sync=dict(word="shows", mark=0), syncEnd=dict(word="sent", mark=1))], transition="slide")
shot(31)
shot(32)
shot(33, [vid("ver", "trust", "verify", sync=dict(word="replay", mark=0))], transition="push")
# A dashed ring over the recording's Checks panel, and the camera pushes in.
shot(34, [box("ring", "replays", 8.85, 2.8, 3.35, 2.8, " ", tone="ghost")], [act("replays", "focus", ["ring"])])

# 12 - tested
shot(35, [num("n89", "eighty-nine", 0.9, 2.0, 4.3, 2.1, 89, "contract tests passing")], transition="zoom")
shot(36, [num("n144", "forty-four", 5.9, 2.0, 4.3, 2.1, 144, "cases: both engines agree")])
shot(37, [num("n30", "thirty", 10.8, 2.0, 4.3, 2.1, 30, "live calls to a real model")])
shot(38, [num("n0", "unsafe", 5.4, 5.0, 5.2, 2.4, 0, "unsafe actions got through", "%")], [act("validation", "pulse", "n0")])

# 13 - the vault health feed
shot(39, [box("hf", "measures", 0.9, 2.2, 5.6, 1.5, "Vault Health Feed", "measured redemption times", "clock", "accent"),
          dict(id="lat", kind="table", at="redemptions", x=7.4, y=2.2, w=7.6, h=2.5,
               columns=["redemptions", "measured"], rows=[["median settle", "0.26 hours"], ["slowest settled", "12.7 days"]])],
     transition="slide")
shot(40, [box("hist", "history", 0.9, 5.3, 5.6, 1.4, "Request history", "read from the vault", "database"),
          chip("docs", "documentation", 7.4, 5.65, 4.2, 0.7, "the docs' promise", "ghost"),
          arrow("h1", "history", "hist", "hf", flow=True)],
     [act("documentation", "cross", "docs")])

# 14 - under the hood
shot(41, [dict(id="code", kind="code", at="graduate", x=0.9, y=1.5, w=9.4, h=4.3, title="contracts/src/StewardAccount.sol",
               lines=["function graduate() external nonReentrant {",
                      "    uint16 failedMask = TierEngine.checkPromotion(",
                      "        tierState,",
                      "…",
                      "    );",
                      "    if (failedMask != 0) revert NotEligibleForGraduation();",
                      "    tierState = TierEngine.graduate(tierState, nowTs);",
                      "}"], focus=[]),
          dict(id="conds2", kind="list", at="condition", x=10.8, y=1.5, w=4.4, h=4.3,
               items=["time served", "risk carried", "authority used", "receipts", "no incidents"])],
     [act("passes", "focus", ["code"]), act("holds", "highlight", "code", lines=[6])], transition="zoom")
shot(42, [stamp("earned", "earned", 5.8, 6.4, 3.6, 1.1, "earned", "ok")], [act("authority", "reset", [])])

Path(__file__).with_name("shots.json").write_text(json.dumps({"shots": S}, indent=1, ensure_ascii=False), encoding="utf8")
print(len(S), "shots")
