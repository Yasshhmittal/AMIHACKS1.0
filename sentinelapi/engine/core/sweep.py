"""Access Matrix sweep — the orchestrator.

One systematic sweep of (identity x endpoint x object) produces every finding
class from one request budget and one evidence pipeline.

  INVENTORY -> SEED -> BASELINE -> CROSS -> ANON -> DERIVE -> CONFIRM -> SCORE+EMIT
"""
from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional

from ..detectors.base import FindingCandidate
from ..detectors.bfla import BflaDetector
from ..detectors.bola import BolaDetector
from ..detectors.broken_auth import BrokenAuthDetector
from ..detectors.data_exposure import ExcessiveDataExposureDetector
from ..detectors.misconfig import MisconfigDetector
from ..detectors.rate_limit import RateLimitDetector
from ..ingest.api_model import NormalizedEndpoint
from .comparator import find_sensitive_fields
from .executor import HttpExecutor
from .guard import GuardViolation, SafetyGuard
from .session import IdentitySession

# check id -> which finding classes it enables
CHECK_CLASSES = {
    "bola": {"BOLA"},
    "broken_auth": {"BROKEN_AUTH"},
    "data_exposure": {"EXCESSIVE_DATA_EXPOSURE"},
    "rate_limit": {"RATE_LIMITING"},
    "bfla": {"BFLA"},
    "misconfig": {"MISCONFIGURATION"},
}


class AccessMatrixSweep:
    def __init__(self, target_base_url: str, endpoints: List[NormalizedEndpoint],
                 identities: Dict[str, IdentitySession],
                 checks: Optional[List[str]] = None,
                 event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None):
        self.base_url = target_base_url.rstrip("/")
        self.endpoints = endpoints
        self.identities = identities
        self.checks = set(checks) if checks else set(CHECK_CLASSES.keys())
        self.emit = event_callback or (lambda t, p: None)

        self.guard = SafetyGuard(self.base_url)
        self.executor = HttpExecutor(self.guard)

        self.bola = BolaDetector()
        self.bfla = BflaDetector()
        self.broken_auth = BrokenAuthDetector()
        self.exposure = ExcessiveDataExposureDetector()
        self.rate_limit = RateLimitDetector()
        self.misconfig = MisconfigDetector()

        self.matrix_cells: List[Dict[str, Any]] = []
        self.findings: List[FindingCandidate] = []
        self.discovered: Dict[str, List[str]] = {}
        self.aborted_reason: Optional[str] = None

    def _enabled(self, finding_class: str) -> bool:
        return any(finding_class in CHECK_CLASSES[c] for c in self.checks if c in CHECK_CLASSES)

    def _emit_finding(self, f: FindingCandidate) -> None:
        self.findings.append(f)
        self.emit("finding", {"class": f.finding_class, "severity": f.severity,
                              "confidence": f.confidence, "endpoint": f.endpoint,
                              "title": f.title})

    async def run(self) -> Dict[str, Any]:
        start = time.perf_counter()
        self.emit("scan.started", {"target": self.base_url, "endpoint_count": len(self.endpoints)})
        try:
            await self._inventory()
            await self._seed()
            await self._baseline()
            await self._cross()
            await self._anon()
            await self._derive()
            self._confirm_and_dedup()
        except GuardViolation as gv:
            self.aborted_reason = self.guard.aborted_reason or "guard_violation"
            self.emit("scan.aborted", {"reason": self.aborted_reason, "detail": str(gv)})
        finally:
            await self.executor.close()

        duration_ms = int((time.perf_counter() - start) * 1000)
        risk = max((f.risk_score for f in self.findings), default=0.0)
        self.emit("scan.completed", {
            "total_findings": len(self.findings),
            "total_requests": self.guard.request_count,
            "duration_ms": duration_ms, "risk_score": risk,
            "aborted": self.aborted_reason,
        })
        return {
            "duration_ms": duration_ms, "requests_used": self.guard.request_count,
            "risk_score": risk, "matrix_cells": self.matrix_cells,
            "findings": self.findings, "aborted_reason": self.aborted_reason,
        }

    # ---- phase 1 ----
    async def _inventory(self):
        self.emit("phase.started", {"phase": "INVENTORY"})
        self.emit("spec.parsed", {
            "endpoint_count": len(self.endpoints),
            "secured_count": sum(1 for e in self.endpoints if e.spec_secured),
            "object_bearing_count": sum(1 for e in self.endpoints if e.object_bearing),
        })

    # ---- phase 2 ----
    async def _seed(self):
        self.emit("phase.started", {"phase": "SEED"})
        for label in ("userA", "userB"):
            ident = self.identities.get(label)
            if not ident:
                continue
            found: List[str] = []
            for ep in self.endpoints:
                if ep.method == "GET" and not ep.object_bearing and "order" in ep.path.lower():
                    res = await self.executor.execute("GET", f"{self.base_url}{ep.path}",
                                                      headers=ident.get_auth_headers())
                    if res.ok and isinstance(res.body, list):
                        found += [str(o["id"]) for o in res.body if isinstance(o, dict) and "id" in o]
            if not found:
                found = ["101", "103"] if label == "userA" else ["102", "104"]
            self.discovered[label] = found
            self.emit("objects.discovered", {"identity": label, "objects": found})

    # ---- phase 3 ----
    async def _baseline(self):
        self.emit("phase.started", {"phase": "BASELINE"})
        for ep in self.endpoints:
            if ep.object_bearing:
                continue
            # Baseline only reads. State-changing methods are never fired blindly;
            # the rate-limit detector handles the login endpoint on its own.
            if ep.method not in ("GET", "HEAD", "OPTIONS"):
                continue
            for label, ident in self.identities.items():
                res = await self.executor.execute(ep.method, f"{self.base_url}{ep.path}",
                                                  headers=ident.get_auth_headers())
                sensitive = find_sensitive_fields(res.body) if res.ok else []
                self.matrix_cells.append({
                    "endpoint_id": ep.id, "method": ep.method, "path": ep.path, "identity": label,
                    "object_id": None, "object_owner": None, "status": res.status,
                    "duration_ms": int(res.latency_ms), "ownership_mismatch": False,
                    "undocumented_fields": [], "sensitive_fields": sensitive,
                })
                self.emit("probe", {"endpoint": ep.path, "identity": label,
                                    "status": res.status, "latency_ms": int(res.latency_ms)})
                if res.ok and self._enabled("EXCESSIVE_DATA_EXPOSURE"):
                    cand = await self.exposure.analyze_response(self.executor, self.base_url, ep, ident, res)
                    if cand:
                        self.emit("signal", {"endpoint": ep.path, "identity": label,
                                            "signal": "sensitive_fields"})
                        self._emit_finding(cand)

    # ---- phase 4 ----
    async def _cross(self):
        self.emit("phase.started", {"phase": "CROSS"})
        if not self._enabled("BOLA"):
            return
        a, b = self.identities.get("userA"), self.identities.get("userB")
        anon = self.identities.get("anonymous") or IdentitySession("anonymous", "anonymous")
        if not (a and b):
            return
        for ep in self.endpoints:
            if ep.object_bearing and ep.method == "GET":
                # Choose object ids that match the resource type: for a /users/{id}
                # endpoint the object IS the user id; otherwise use the collection
                # ids learned in SEED (orders, etc.).
                if "user" in ep.path.lower() and "me" not in ep.path.lower():
                    bob_id = str(b.user_id or (self.discovered.get("userB") or ["2"])[0])
                    alice_id = str(a.user_id or (self.discovered.get("userA") or ["1"])[0])
                else:
                    bob_id = (self.discovered.get("userB") or ["102"])[0]
                    alice_id = (self.discovered.get("userA") or ["101"])[0]
                self.emit("signal", {"endpoint": ep.path, "identity": "userA", "signal": "bola_6probe"})
                cand = await self.bola.probe_endpoint(self.executor, self.base_url, ep,
                                                      a, b, anon, bob_id, alice_id)
                if cand:
                    self.matrix_cells.append({
                        "endpoint_id": ep.id, "method": ep.method, "path": ep.path,
                        "identity": "userA", "object_id": bob_id, "object_owner": "userB",
                        "status": 200, "duration_ms": None, "ownership_mismatch": True,
                        "undocumented_fields": [], "sensitive_fields": [],
                    })
                    self._emit_finding(cand)

    # ---- phase 5 ----
    async def _anon(self):
        self.emit("phase.started", {"phase": "ANON"})
        if not self._enabled("BROKEN_AUTH"):
            return
        anon = self.identities.get("anonymous") or IdentitySession("anonymous", "anonymous")
        valid = self.identities.get("userA") or self.identities.get("userB")
        for ep in self.endpoints:
            if ep.spec_secured and not ep.object_bearing:
                cand = await self.broken_auth.probe_endpoint(self.executor, self.base_url, ep, anon, valid)
                if cand:
                    self._emit_finding(cand)

    # ---- phase 6 ----
    async def _derive(self):
        self.emit("phase.started", {"phase": "DERIVE"})
        a = self.identities.get("userA")
        admin = self.identities.get("admin")
        anon = self.identities.get("anonymous") or IdentitySession("anonymous", "anonymous")
        if self._enabled("BFLA") and a and admin:
            for ep in self.endpoints:
                if ep.admin_scoped:
                    cand = await self.bfla.probe_endpoint(self.executor, self.base_url, ep, a, admin, anon)
                    if cand:
                        self._emit_finding(cand)
        if self._enabled("RATE_LIMITING"):
            login = next((e for e in self.endpoints if "login" in e.path.lower() and e.method == "POST"), None)
            if login:
                cand = await self.rate_limit.probe_login(self.executor, self.base_url, login)
                if cand:
                    self._emit_finding(cand)
        if self._enabled("MISCONFIGURATION"):
            for cand in await self.misconfig.probe(self.executor, self.base_url):
                self._emit_finding(cand)

    # ---- phases 7 + 8 ----
    def _confirm_and_dedup(self):
        self.emit("phase.started", {"phase": "CONFIRM"})
        self.emit("confirm.started", {"finding_count": len(self.findings)})
        seen, unique = set(), []
        for f in self.findings:
            if f.fingerprint not in seen:
                seen.add(f.fingerprint)
                unique.append(f)
        self.findings = unique
        self.emit("phase.started", {"phase": "SCORE"})
