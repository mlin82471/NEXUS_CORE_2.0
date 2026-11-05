import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.sdk import nexus_agent, register_custom_agent, NexusAgent
from app.services.registry import get_custom_agent_instance


# 1. 方式一：使用 @nexus_agent 极简装饰器 (1行注解接入任意业务函数)
@nexus_agent(
    name="FastSqlAnalyst",
    role="analysis",
    description="自动分析慢查询 SQL 并推荐索引",
    capabilities=["sql_explain", "read_data"]
)
def run_sql_diagnosis(goal: str, cancel_event=None) -> str:
    return f"【SQL诊断专家反馈】针对目标 [{goal}]：分析发现无索引全表扫描，建议为表 orders 增加 (user_id, status) 复合索引！"


# 2. 方式二：使用 NexusAgent 类继承 (面向对象扩展)
class WeatherAgent(NexusAgent):
    name = "WeatherAgent"
    role = "research"
    description = "查询全球实时天气与环境数据"
    capabilities = ["weather_api", "read_data"]

    def execute(self, goal: str, cancel_event=None) -> str:
        return f"【实时气象监测反馈】目标: {goal} -> 当前天气晴朗，气温 21℃，适宜系统高并发压测。"


register_custom_agent(WeatherAgent())


def main():
    print("=" * 60)
    print("🚀 NEXUS CORE 2.0 — Custom SDK Agent Dispatch Demo")
    print("=" * 60)

    # 1. Dispatch FastSqlAnalyst
    sql_agent = get_custom_agent_instance("FastSqlAnalyst")
    print(f"✓ Retrieved Custom Agent: FastSqlAnalyst ({sql_agent.role})")
    res1 = sql_agent.run("排查 orders 表慢查询导致连接池占满问题")
    print(f"\n[FastSqlAnalyst Output]:\n{res1.result}")
    print(f"Token Stats: In={res1.input_tokens}, Out={res1.output_tokens}, Source={res1.usage_source}")

    # 2. Dispatch WeatherAgent
    weather_agent = get_custom_agent_instance("WeatherAgent")
    print(f"\n✓ Retrieved Custom Agent: WeatherAgent ({weather_agent.role})")
    res2 = weather_agent.run("查询华北数据中心周边气温")
    print(f"\n[WeatherAgent Output]:\n{res2.result}")
    print(f"Token Stats: In={res2.input_tokens}, Out={res2.output_tokens}, Source={res2.usage_source}")

    print("\n✅ Custom Agent SDK Verification Passed!")


if __name__ == "__main__":
    main()
