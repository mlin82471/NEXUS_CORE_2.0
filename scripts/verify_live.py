import urllib.request
import json
import time

def verify():
    # 1. Create task
    req = urllib.request.Request(
        "http://127.0.0.1:8000/tasks",
        data=json.dumps({"goal": "编写一个快速排序算法并测试", "task_type": "coding"}).encode(),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    task = json.loads(res.read().decode())
    task_id = task["task_id"]
    print(f"Task Created: {task_id}, status={task['status']}, source={task['plan_source']}, steps={task['steps']}")

    # 2. Execute task
    exec_req = urllib.request.Request(
        f"http://127.0.0.1:8000/tasks/{task_id}/execute",
        data=b"{}",
        headers={"Content-Type": "application/json"}
    )
    exec_res = urllib.request.urlopen(exec_req)
    exec_data = json.loads(exec_res.read().decode())
    print(f"Task Execution: {exec_data}")

    # 3. Fetch details
    detail_res = urllib.request.urlopen(f"http://127.0.0.1:8000/tasks/{task_id}")
    detail = json.loads(detail_res.read().decode())
    print(f"Final Task Status: {detail['status']}")
    print(f"Execution Round: {detail.get('execution_round')}")
    print(f"Warnings: {detail.get('warnings')}")
    for s in detail["steps"]:
        print(f"  Step [{s['step_key']}] role={s['role']} status={s['status']} error={s.get('error')}")
        if s.get('result'):
            print(f"    Result excerpt: {s['result'][:120]}...")

if __name__ == "__main__":
    verify()
