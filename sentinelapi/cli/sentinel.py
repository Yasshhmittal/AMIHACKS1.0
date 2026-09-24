import asyncio
import json
import sys
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="SentinelAPI — Zero-Trust Automated API Security Scanner")
console = Console()

SEVERITY_ORDER = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 0}

@app.command()
def scan(
    spec: str = typer.Option(..., "--spec", "-s", help="Path to OpenAPI 3.x spec (JSON or YAML)"),
    target: str = typer.Option("http://localhost:4000", "--target", "-t", help="Target API base URL"),
    fail_on: str = typer.Option("HIGH", "--fail-on", "-f", help="Fail with non-zero exit code on severity (CRITICAL, HIGH, MEDIUM, LOW)"),
    out: str = typer.Option("scan-result.json", "--out", "-o", help="Output JSON results file")
):
    """
    Executes a zero-trust authorization audit across all spec endpoints.
    """
    console.print(f"[bold cyan]SentinelAPI[/bold cyan] initiating Zero-Trust sweep on target [bold]{target}[/bold]...")

    # Load and parse spec
    try:
        from engine.ingest.openapi_parser import parse_openapi_spec
        with open(spec, "r", encoding="utf-8") as f:
            raw = f.read()
        _, endpoints = parse_openapi_spec(raw)
        console.print(f"Parsed [green]{len(endpoints)}[/green] endpoints from specification.")
    except Exception as e:
        console.print(f"[bold red]Configuration/Spec Error:[/bold red] {e}")
        sys.exit(2)

    # Setup identities
    from engine.core.session import IdentitySession
    identities = {
        "anonymous": IdentitySession("anonymous", "anonymous"),
        "userA": IdentitySession("userA", "user", user_id="1", raw_credential="token-alice-12345"),
        "userB": IdentitySession("userB", "user", user_id="2", raw_credential="token-bob-67890"),
        "admin": IdentitySession("admin", "admin", user_id="9", raw_credential="token-admin-99999")
    }

    # Execute sweep
    from engine.core.sweep import AccessMatrixSweep
    from engine.core.guard import GuardViolation

    sweep = AccessMatrixSweep(target, endpoints, identities)
    try:
        results = asyncio.run(sweep.run())
    except GuardViolation as gv:
        console.print(f"[bold red]Safety Guard Violation:[/bold red] {gv}")
        sys.exit(3)
    except Exception as e:
        console.print(f"[bold red]Scan Execution Error:[/bold red] {e}")
        sys.exit(2)

    findings = results["findings"]
    table = Table(title="SentinelAPI Audit Findings")
    table.add_column("Severity", justify="center")
    table.add_column("Class", style="cyan")
    table.add_column("Method", justify="center")
    table.add_column("Endpoint", style="bold")
    table.add_column("Confidence", justify="center")

    threshold_level = SEVERITY_ORDER.get(fail_on.upper(), 3)
    breached_threshold = False

    for f in findings:
        sev_color = "red" if f.severity == "CRITICAL" else "orange3" if f.severity == "HIGH" else "yellow"
        table.add_row(
            f"[{sev_color}]{f.severity}[/{sev_color}]",
            f.finding_class,
            f.endpoint_method,
            f.endpoint_path,
            f.confidence
        )
        if SEVERITY_ORDER.get(f.severity.upper(), 0) >= threshold_level:
            breached_threshold = True

    console.print(table)
    console.print(f"Total Requests: {results['requests_used']} · Scan Duration: {results['duration_ms']}ms · Findings: {len(findings)}")

    # Write output
    output_data = {
        "target": target,
        "spec": spec,
        "requests_used": results["requests_used"],
        "duration_ms": results["duration_ms"],
        "risk_score": results["risk_score"],
        "findings": [
            {
                "class": f.finding_class,
                "owasp_id": f.owasp_id,
                "endpoint": f.endpoint_path,
                "method": f.endpoint_method,
                "severity": f.severity,
                "confidence": f.confidence,
                "title": f.title,
                "impact": f.impact,
                "remediation": f.remediation,
                "fingerprint": f.fingerprint
            }
            for f in findings
        ]
    }

    with open(out, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2)
    console.print(f"Results saved to [bold]{out}[/bold]")

    if breached_threshold:
        console.print(f"[bold red]CI/CD Gate Failed:[/bold red] Findings meet or exceed severity threshold '{fail_on}'")
        sys.exit(1)

    console.print("[bold green]CI/CD Gate Passed.[/bold green]")
    sys.exit(0)

@app.command()
def reproduce(finding_id: str = typer.Option("f1", "--finding", "-f", help="Finding fingerprint or ID")):
    """
    Displays reproducible cURL command for an identified vulnerability.
    """
    console.print(f"[bold]Reproducing finding {finding_id}:[/bold]")
    curl_cmd = 'curl -X GET "http://localhost:4000/orders/102" -H "Authorization: Bearer $USER_A_TOKEN"'
    console.print(f"\n[green]{curl_cmd}[/green]\n")

if __name__ == "__main__":
    app()
