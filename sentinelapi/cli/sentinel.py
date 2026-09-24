"""SentinelAPI CLI — scan from the terminal for CI/CD gating.

    sentinel scan --spec api.yaml --target http://localhost:4000 --fail-on high --out result.json

Exit codes:
    0  clean (no findings at/above threshold)
    1  findings >= threshold
    2  config / target error
    3  budget or deadline exhausted
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

# allow running as `python cli/sentinel.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.core.guard import BudgetExhausted, GuardViolation  # noqa: E402
from engine.core.session import IdentitySession  # noqa: E402
from engine.core.sweep import AccessMatrixSweep  # noqa: E402
from engine.ingest.openapi_parser import parse_openapi_spec  # noqa: E402

app = typer.Typer(add_completion=False, help="SentinelAPI — Zero-Trust API vulnerability scanner")
console = Console()

SEV_RANK = {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

DEFAULT_IDENTITIES = {
    "anonymous": IdentitySession("anonymous", "anonymous"),
    "userA": IdentitySession("userA", "user", "1", "token-alice-12345"),
    "userB": IdentitySession("userB", "user", "2", "token-bob-67890"),
    "admin": IdentitySession("admin", "admin", "9", "token-admin-99999"),
}


async def _run(spec_path: str, target: str) -> dict:
    endpoints, _ = parse_openapi_spec(Path(spec_path).read_text())
    sweep = AccessMatrixSweep(target, endpoints, DEFAULT_IDENTITIES)
    return await sweep.run()


@app.command()
def scan(spec: str = typer.Option(..., help="OpenAPI spec (json/yaml)"),
         target: str = typer.Option(..., help="Target base URL"),
         fail_on: str = typer.Option("high", "--fail-on", help="critical|high|medium|low|info"),
         out: Optional[str] = typer.Option(None, help="Write JSON result to this path")):
    threshold = SEV_RANK.get(fail_on.upper(), 3)
    try:
        result = asyncio.run(_run(spec, target))
    except GuardViolation as gv:
        console.print(f"[red]Guard violation:[/red] {gv}")
        raise typer.Exit(code=2)
    except BudgetExhausted as be:
        console.print(f"[yellow]Budget/deadline exhausted:[/yellow] {be}")
        raise typer.Exit(code=3)
    except FileNotFoundError:
        console.print(f"[red]Spec not found:[/red] {spec}")
        raise typer.Exit(code=2)

    findings = result["findings"]
    table = Table(title="SentinelAPI Findings")
    for col in ("Severity", "Confidence", "Class", "Endpoint"):
        table.add_column(col)
    colors = {"CRITICAL": "red", "HIGH": "dark_orange", "MEDIUM": "yellow", "LOW": "blue", "INFO": "grey62"}
    for f in sorted(findings, key=lambda x: -SEV_RANK.get(x.severity, 0)):
        table.add_row(f"[{colors.get(f.severity,'white')}]{f.severity}[/]", f.confidence,
                      f.finding_class, f.endpoint)
    console.print(table)
    console.print(f"{len(findings)} finding(s) · {result['requests_used']} requests · "
                  f"{result['duration_ms']}ms · risk {result['risk_score']:.0f}")

    if out:
        Path(out).write_text(json.dumps({
            "target": target, "spec": spec, "requests_used": result["requests_used"],
            "duration_ms": result["duration_ms"], "risk_score": result["risk_score"],
            "findings": [{"class": f.finding_class, "owasp_id": f.owasp_id, "endpoint": f.endpoint,
                          "severity": f.severity, "confidence": f.confidence, "title": f.title,
                          "impact": f.impact} for f in findings]}, indent=2))
        console.print(f"[green]Wrote[/green] {out}")

    worst = max((SEV_RANK.get(f.severity, 0) for f in findings), default=-1)
    if worst >= threshold:
        console.print(f"[red]FAIL[/red]: findings at or above '{fail_on}' threshold.")
        raise typer.Exit(code=1)
    console.print(f"[green]PASS[/green]: no findings at or above '{fail_on}'.")
    raise typer.Exit(code=0)


if __name__ == "__main__":
    app()
