import httpx
import time

def run_test():
    with httpx.Client(base_url="http://127.0.0.1:8000", timeout=15.0) as client:
        # 1. Root check
        r = client.get("/")
        print("1. Root:", r.json())

        # 2. Create Target
        r = client.post("/api/targets", json={"base_url": "http://127.0.0.1:4000", "environment": "sandbox"})
        print("2. Target Created:", r.json())

        # 3. Verify Identities
        r = client.post("/api/targets/1/verify")
        print("3. Identities Verified:", r.json()["all_ok"])

        # 4. Start Scan
        r = client.post("/api/scans", json={"target_id": 1, "spec_id": 1})
        print("4. Scan Started:", r.json())

        # Wait for background sweep
        time.sleep(2.0)

        # 5. Get Findings
        r = client.get("/api/scans/1/findings")
        findings = r.json()
        print(f"5. Total Findings: {len(findings)}")
        for f in findings:
            print(f"   -> [{f['severity']}] {f['class']} ({f['confidence']}) - {f['title']}")

        # 6. PoC
        r = client.get("/api/findings/1/poc")
        print(f"6. PoC cURL:\n   {r.json()['curl']}")

        # 7. Live Re-verify (Expect still_vulnerable)
        r = client.post("/api/findings/1/verify")
        print("7. Re-verify Before Fix:", r.json()["status"], "->", r.json()["message"])

        # 8. Apply Sandbox Fix
        r = client.post("/api/demo/fix/bola_orders", json={"enabled": True})
        print("8. Sandbox Fix Applied:", r.json())

        # 9. Live Re-verify (Expect FIXED!)
        r = client.post("/api/findings/1/verify")
        print("9. Re-verify After Fix:", r.json()["status"], "->", r.json()["message"])

        # 10. AI Explanation Test (using Groq)
        print("10. Testing AI Explanation (Groq LLaMA 3.3 70B)...")
        r = client.post("/api/findings/1/explain")
        explain_res = r.json()
        print(f"    Source: {explain_res['source']}")
        print(f"    Preview: {explain_res['explanation_md'][:180]}...")

if __name__ == "__main__":
    run_test()
