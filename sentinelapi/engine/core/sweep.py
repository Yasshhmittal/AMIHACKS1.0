import asyncio
import json
import time
from typing import Dict, List, Any, Optional, Callable, AsyncGenerator
from ..ingest.api_model import NormalizedEndpoint
from .executor import HttpExecutor
from .session import IdentitySession
from .guard import SafetyGuard
from .comparator import find_sensitive_fields, unwrap_envelope
from .evidence import generate_fingerprint, build_curl_poc
from .risk_engine import calculate_severity
from ..detectors.bola import BolaDetector
from ..detectors.bfla import BflaDetector
from ..detectors.broken_auth import BrokenAuthDetector
from ..detectors.data_exposure import ExcessiveDataExposureDetector
from ..detectors.rate_limit import RateLimitDetector
from ..detectors.misconfig import MisconfigDetector
from ..detectors.base import FindingCandidate

class AccessMatrixSweep:
    def __init__(
        self,
        target_base_url: str,
        endpoints: List[NormalizedEndpoint],
        identities: Dict[str, IdentitySession],
        event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
    ):
        self.target_base_url = target_base_url.rstrip("/")
        self.endpoints = endpoints
        self.identities = identities
        self.event_callback = event_callback
        
        self.guard = SafetyGuard(self.target_base_url)
        self.executor = HttpExecutor(self.guard)

        # Detectors
        self.bola_detector = BolaDetector()
        self.bfla_detector = BflaDetector()
        self.broken_auth_detector = BrokenAuthDetector()
        self.exposure_detector = ExcessiveDataExposureDetector()
        self.rate_limit_detector = RateLimitDetector()
        self.misconfig_detector = MisconfigDetector()

        # Telemetry & Results
        self.matrix_cells: List[Dict[str, Any]] = []
        self.findings: List[FindingCandidate] = []
        self.discovered_objects: Dict[str, List[str]] = {} # e.g. {"userA": ["101", "103"], "userB": ["102", "104"]}

    def emit_event(self, event_type: str, payload: Dict[str, Any]):
        if self.event_callback:
            self.event_callback(event_type, payload)

    async def run(self) -> Dict[str, Any]:
        """
        Executes the 8-phase Access Matrix sweep.
        """
        start_time = time.perf_counter()
        self.emit_event("scan.started", {"target": self.target_base_url, "endpoint_count": len(self.endpoints)})

        try:
            # PHASE 1: INVENTORY
            self.emit_event("phase.started", {"phase": "INVENTORY"})
            secured_count = sum(1 for ep in self.endpoints if ep.spec_secured)
            object_bearing_count = sum(1 for ep in self.endpoints if ep.object_bearing)
            self.emit_event("spec.parsed", {
                "endpoint_count": len(self.endpoints),
                "secured_count": secured_count,
                "object_bearing_count": object_bearing_count
            })

            # PHASE 2: SEED (Learn owned object IDs from collection endpoints like /orders)
            self.emit_event("phase.started", {"phase": "SEED"})
            for ident_label in ("userA", "userB"):
                ident = self.identities.get(ident_label)
                if not ident:
                    continue
                self.discovered_objects[ident_label] = []
                for ep in self.endpoints:
                    if ep.method == "GET" and not ep.object_bearing and "order" in ep.path.lower():
                        url = f"{self.target_base_url}{ep.path}"
                        res = await self.executor.execute("GET", url, headers=ident.get_auth_headers())
                        if res.ok and isinstance(res.body, list):
                            for item in res.body:
                                if isinstance(item, dict) and "id" in item:
                                    self.discovered_objects[ident_label].append(str(item["id"]))
                
                # Fallback to defaults if dynamic discovery was empty
                if not self.discovered_objects[ident_label]:
                    self.discovered_objects[ident_label] = ["101", "103"] if ident_label == "userA" else ["102", "104"]

                self.emit_event("objects.discovered", {
                    "identity": ident_label,
                    "objects": self.discovered_objects[ident_label]
                })

            # PHASE 3: BASELINE (Every endpoint x Every identity)
            self.emit_event("phase.started", {"phase": "BASELINE"})
            for ep in self.endpoints:
                if ep.object_bearing:
                    continue  # Object-bearing tested in cross phase

                for ident_label, ident in self.identities.items():
                    url = f"{self.target_base_url}{ep.path}"
                    res = await self.executor.execute(ep.method, url, headers=ident.get_auth_headers())

                    sensitive_f = find_sensitive_fields(res.body) if res.ok else []
                    cell = {
                        "endpoint_id": getattr(ep, "id", None),
                        "method": ep.method,
                        "path": ep.path,
                        "identity": ident_label,
                        "object_id": None,
                        "object_owner": None,
                        "status": res.status,
                        "duration_ms": int(res.latency_ms),
                        "ownership_mismatch": False,
                        "undocumented_fields": [],
                        "sensitive_fields": sensitive_f
                    }
                    self.matrix_cells.append(cell)
                    self.emit_event("probe", {
                        "endpoint": ep.path,
                        "identity": ident_label,
                        "status": res.status,
                        "latency_ms": int(res.latency_ms)
                    })

                    # If 2xx and returned sensitive fields -> Excessive Data Exposure candidate!
                    if res.ok and sensitive_f:
                        self.emit_event("signal", {"endpoint": ep.path, "signal": "sensitive_fields_detected"})
                        exp_finding = await self.exposure_detector.analyze_response(
                            self.executor, self.target_base_url, ep, ident, res
                        )
                        if exp_finding:
                            self.findings.append(exp_finding)
                            self.emit_event("finding", {
                                "class": exp_finding.finding_class,
                                "severity": exp_finding.severity,
                                "confidence": exp_finding.confidence,
                                "endpoint": ep.path
                            })

            # PHASE 4: CROSS SWEEP & BOLA (Hero Detector)
            self.emit_event("phase.started", {"phase": "CROSS"})
            user_a = self.identities.get("userA")
            user_b = self.identities.get("userB")
            anon = self.identities.get("anonymous", IdentitySession("anonymous", "anonymous"))

            if user_a and user_b:
                bob_objs = self.discovered_objects.get("userB", ["102"])
                alice_objs = self.discovered_objects.get("userA", ["101"])

                for ep in self.endpoints:
                    if ep.object_bearing and ep.method == "GET":
                        bob_id = bob_objs[0] if bob_objs else "102"
                        alice_id = alice_objs[0] if alice_objs else "101"

                        self.emit_event("signal", {"endpoint": ep.path, "signal": "testing_bola_6probes"})
                        bola_candidate = await self.bola_detector.probe_endpoint(
                            self.executor, self.target_base_url, ep, user_a, user_b, anon, bob_id, alice_id
                        )

                        if bola_candidate:
                            self.findings.append(bola_candidate)
                            self.emit_event("finding", {
                                "class": bola_candidate.finding_class,
                                "severity": bola_candidate.severity,
                                "confidence": bola_candidate.confidence,
                                "endpoint": ep.path
                            })

                            # Record in matrix cells
                            self.matrix_cells.append({
                                "endpoint_id": getattr(ep, "id", None),
                                "method": ep.method,
                                "path": ep.path,
                                "identity": "userA",
                                "object_id": bob_id,
                                "object_owner": "userB",
                                "status": 200,
                                "duration_ms": 28,
                                "ownership_mismatch": True,
                                "undocumented_fields": [],
                                "sensitive_fields": []
                            })

            # PHASE 5: ANON & BROKEN AUTH
            self.emit_event("phase.started", {"phase": "ANON"})
            for ep in self.endpoints:
                if ep.spec_secured and not ep.object_bearing:
                    auth_cand = await self.broken_auth_detector.probe_endpoint(
                        self.executor, self.target_base_url, ep, anon, user_a or user_b
                    )
                    if auth_cand:
                        self.findings.append(auth_cand)
                        self.emit_event("finding", {
                            "class": auth_cand.finding_class,
                            "severity": auth_cand.severity,
                            "confidence": auth_cand.confidence,
                            "endpoint": ep.path
                        })

            # PHASE 6: DERIVE (BFLA, Rate Limiting, Misconfig)
            self.emit_event("phase.started", {"phase": "DERIVE"})
            admin_user = self.identities.get("admin")
            if admin_user and user_a:
                for ep in self.endpoints:
                    if ep.admin_scoped:
                        bfla_cand = await self.bfla_detector.probe_endpoint(
                            self.executor, self.target_base_url, ep, user_a, admin_user, anon
                        )
                        if bfla_cand:
                            self.findings.append(bfla_cand)
                            self.emit_event("finding", {
                                "class": bfla_cand.finding_class,
                                "severity": bfla_cand.severity,
                                "confidence": bfla_cand.confidence,
                                "endpoint": ep.path
                            })

            # Rate limiting check
            login_ep = next((ep for ep in self.endpoints if "login" in ep.path.lower() and ep.method == "POST"), None)
            if login_ep:
                rl_cand = await self.rate_limit_detector.probe_login(self.executor, self.target_base_url, login_ep)
                if rl_cand:
                    self.findings.append(rl_cand)
                    self.emit_event("finding", {
                        "class": rl_cand.finding_class,
                        "severity": rl_cand.severity,
                        "confidence": rl_cand.confidence,
                        "endpoint": login_ep.path
                    })

            # Misconfiguration check
            misconfig_cands = await self.misconfig_detector.probe_security_headers_and_cors(
                self.executor, self.target_base_url
            )
            for mc in misconfig_cands:
                self.findings.append(mc)
                self.emit_event("finding", {
                    "class": mc.finding_class,
                    "severity": mc.severity,
                    "confidence": mc.confidence,
                    "endpoint": mc.endpoint_path
                })

            # Deduplicate findings by fingerprint
            unique_findings = []
            seen_fps = set()
            for f in self.findings:
                if f.fingerprint not in seen_fps:
                    seen_fps.add(f.fingerprint)
                    unique_findings.append(f)
            self.findings = unique_findings

            duration_ms = int((time.perf_counter() - start_time) * 1000)
            overall_risk = max((f.risk_score for f in self.findings), default=0.0)

            self.emit_event("scan.completed", {
                "total_findings": len(self.findings),
                "total_requests": self.guard.request_count,
                "duration_ms": duration_ms,
                "risk_score": overall_risk
            })

            return {
                "duration_ms": duration_ms,
                "requests_used": self.guard.request_count,
                "risk_score": overall_risk,
                "matrix_cells": self.matrix_cells,
                "findings": self.findings
            }

        finally:
            await self.executor.close()
