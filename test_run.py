import time
import httpx
import sys

BASE_URL = "https://sentinel-backend-box9.onrender.com"

def run_test():
    print("Logging in to get access token...")
    try:
        # create account explicitly
        print("Registering account...")
        try:
            httpx.post(f"{BASE_URL}/api/v1/auth/register", json={
                "email": "test-admin@example.com",
                "password": "adminpassword123",
                "name": "Test Admin"
            }, timeout=60.0)
        except Exception:
            pass # Ignore if already registered
        
        login_url = f"{BASE_URL}/api/v1/auth/login"
        print(f"POST {login_url}")
        
        # Checking schema from main.py if form-url-encoded or json
        resp = httpx.post(login_url, json={
            "email": "test-admin@example.com",
            "password": "adminpassword123"
        }, timeout=60.0)
        if resp.status_code != 200:
            print(resp.text)
        resp.raise_for_status()
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)

    print("Creating a test incident...")
    try:
        ingest_payload = {
            "service": "database-cluster",
            "environment": "production",
            "symptoms": ["Connection timeouts", "High latency"],
            "signals": [{"metric": "connection_pool", "status": "firing", "signal_severity": "severe"}],
            "changes": []
        }
        resp = httpx.post(f"{BASE_URL}/api/v1/incidents/ingest", json=ingest_payload, headers=headers, timeout=60.0)
        resp.raise_for_status()
        incident_id = resp.json()["incident_id"]
        print(f"Incident created: {incident_id}")
    except Exception as e:
        print(f"Ingest failed: {e}")
        sys.exit(1)

    print("Triggering analysis...")
    try:
        analyze_payload = {
            "incident_id": incident_id,
            "symptoms": ["Connection timeouts", "High latency"],
            "signals": [{"metric": "connection_pool", "status": "firing", "signal_severity": "severe"}],
            "changes": []
        }
        # Render cold starts + python might be slow on initially triggering background task, provide generous timeout
        resp = httpx.post(f"{BASE_URL}/api/v1/incidents/analyze", json=analyze_payload, headers=headers, timeout=60.0)
        resp.raise_for_status()
        task_id = resp.json().get("task_id", incident_id)
        print(f"Analysis started. Task ID: {task_id}")
    except Exception as e:
        print(f"Analyze trigger failed: {e}")
        sys.exit(1)

    print("Polling status every 3 seconds...")
    for i in range(30): # max 90 seconds
        try:
            status_resp = httpx.get(f"{BASE_URL}/api/v1/incidents/analyze/{task_id}/status", headers=headers)
            status_resp.raise_for_status()
            data = status_resp.json()
            status = data.get("status")
            print(f"[{i*3}s] Status: {status}")
            
            if status in ["completed", "failed"]:
                if status == "failed":
                    print("\n--- ANALYSIS FAILED ---")
                    print(f"Error Details:\n{data.get('error')}")
                else:
                    print("\n--- ANALYSIS COMPLETED SUCCESSFULLY ---")
                return
        except Exception as e:
            print(f"Polling failed: {e}")
            sys.exit(1)
            
        time.sleep(3)
        
    print("\n--- TIMEOUT REACHED (90s) ---")
    print("The task did not complete within 90 seconds.")

if __name__ == "__main__":
    run_test()
