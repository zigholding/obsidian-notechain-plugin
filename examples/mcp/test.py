
import asyncio
from fastmcp import Client

async def main():
    client = Client("http://127.0.0.1:3000/sse")
    try:
        # 2. 使用 async with 建立连接并初始化
        async with client:
            tools = await client.list_tools()
            
            for i, tool in enumerate(tools, 1):
                name = getattr(tool, 'name', 'unknown')
                desc = getattr(tool, 'description', 'no description')
                print(f"  {i}. {name}")
                print(f"     {desc}\n")
            
            # 4. 调用工具示例
            if tools:
                # 示例 2: 获取当前笔记
                if any(getattr(t, 'name', '') == 'get_current_note' for t in tools):
                    print("  执行：获取当前打开的笔记")
                    try:
                        result = await client.call_tool(
                            name='get_current_note',
                            arguments={}
                        )
                        print("  ✓ 获取成功")
                        
                        if hasattr(result, 'content') and result.content:
                            content = result.content[0]
                            if hasattr(content, 'text'):
                                text = content.text
                                print(f"  当前笔记: {text[:200]}...")
                    except Exception as e:
                        print(f"  ✗ 获取失败: {e}")
                
                print()
                
            
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n程序被用户中断")
    except Exception as e:
        print(f"\n✗ 程序错误: {e}")


